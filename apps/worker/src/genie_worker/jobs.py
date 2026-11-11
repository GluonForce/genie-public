"""The worker loop: claim an approved prototype, build it in a sandbox, save the outputs, record
the outcome. One job at a time (architecture 7.2)."""

import asyncio
import logging
from collections.abc import Callable
from decimal import Decimal
from typing import Any, Protocol

from pydantic import TypeAdapter
from pydantic_ai.usage import RunUsage

from genie_worker.artifacts import save_artifacts
from genie_worker.build import BuildResult, build_and_check
from genie_worker.db import Job
from genie_worker.models.requirements import RequirementsDraft
from genie_worker.publish import site_store, site_url, state_store
from genie_worker.sandbox import Sandbox
from genie_worker.storage import Storage

logger = logging.getLogger(__name__)

POLL_SECONDS = 5.0
HEARTBEAT_SECONDS = 30.0
# Stale builds are looked for this often, not on every poll
STALE_CHECK_SECONDS = 300.0


class Queue(Protocol):
    """The parts of db.Database the loop uses."""

    async def claim(self) -> Job | None: ...
    async def heartbeat(self, job: Job) -> bool: ...
    async def finish_success(self, job: Job, **kwargs: Any) -> bool: ...
    async def finish_failure(self, job: Job, **kwargs: Any) -> bool: ...
    async def requeue(self, job: Job, reason: str) -> bool: ...
    async def requeue_stale(self) -> int: ...


async def run_job(
    job: Job,
    queue: Queue,
    storage: Storage,
    open_sandbox: Callable[[], Sandbox],
    *,
    build: Callable[..., Any] = build_and_check,
    save: Callable[..., Any] = save_artifacts,
    publish: Callable[..., Any] | None = None,
) -> None:
    logger.info("Building prototype %s (attempt %s)", job.prototype_id, job.attempt)
    publish = publish or publish_preview
    heartbeat = asyncio.create_task(_heartbeat(queue, job))
    sandbox: Sandbox | None = None
    # Known as soon as they exist, so a later crash still records them
    cost = Decimal(0)
    source_path: str | None = None
    try:
        requirements = RequirementsDraft.model_validate(job.requirements)
        sandbox = await asyncio.to_thread(open_sandbox)
        result: BuildResult = await build(requirements, sandbox, build_note=job.build_note)
        cost = result.usage.cost or Decimal(0)
        paths = await save(sandbox, storage, job.prototype_id, job.attempt, result)
        source_path = paths.source_path
        details = _details(job, result, paths.log_path)
        if result.ok:
            url = await publish(job.slug, paths.site_archive)
            recorded = await queue.finish_success(
                job,
                source_path=paths.source_path,
                site_path=paths.site_path,
                site_url=url,
                cost_usd=cost,
                details=details,
            )
            outcome = "ready for QA"
        else:
            failed = next(check for check in result.checks if not check.ok)
            recorded = await queue.finish_failure(
                job,
                error=f"`{' '.join(failed.command)}` still failed after the fix round",
                cost_usd=cost,
                source_path=paths.source_path,
                details=details,
            )
            outcome = f"failed at {failed.name}"
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        # Model, sandbox, storage or invalid requirements: no automatic restart, an admin can retry
        logger.exception("Build of %s crashed", job.prototype_id)
        error = getattr(exc, "message", None) or f"{type(exc).__name__}: {exc}"
        recorded = await queue.finish_failure(
            job,
            error=error,
            cost_usd=cost,
            source_path=source_path,
            details={"attempt": job.attempt},
        )
        outcome = "crashed"
    finally:
        heartbeat.cancel()
        if sandbox is not None:
            await asyncio.to_thread(sandbox.close)
    if recorded:
        logger.info("Prototype %s %s", job.prototype_id, outcome)
    else:
        logger.warning("Prototype %s %s, but the job was no longer ours", job.prototype_id, outcome)


async def run_worker(
    queue: Queue,
    storage: Storage,
    open_sandbox: Callable[[], Sandbox],
    stop: asyncio.Event,
) -> None:
    logger.info("Worker started; polling for approved prototypes every %ss", POLL_SECONDS)
    last_stale_check = float("-inf")
    loop = asyncio.get_running_loop()
    while not stop.is_set():
        if loop.time() - last_stale_check >= STALE_CHECK_SECONDS:
            requeued = await queue.requeue_stale()
            if requeued:
                logger.warning("Requeued %s build(s) that stopped sending heartbeats", requeued)
            last_stale_check = loop.time()

        job = await queue.claim()
        if job is None:
            await _sleep_unless_stopped(stop, POLL_SECONDS)
            continue

        task = asyncio.create_task(run_job(job, queue, storage, open_sandbox))
        stopping = asyncio.create_task(stop.wait())
        await asyncio.wait({task, stopping}, return_when=asyncio.FIRST_COMPLETED)
        stopping.cancel()
        if not task.done():
            # Shutting down mid-build (e.g. a Railway redeploy): give the job straight back
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            # Conditional: does nothing if the build was already recorded
            if await queue.requeue(job, "worker shut down during the build"):
                logger.info("Requeued %s because the worker is shutting down", job.prototype_id)
    logger.info("Worker stopped")


async def publish_preview(slug: str, site_archive: bytes) -> str:
    """Upload the site to R2 and set its KV state to preview (admins only); returns its URL."""

    await asyncio.to_thread(site_store().publish, slug, site_archive)
    await state_store().set_state(slug, "preview")
    return site_url(slug)


async def _heartbeat(queue: Queue, job: Job) -> None:
    while True:
        await asyncio.sleep(HEARTBEAT_SECONDS)
        if not await queue.heartbeat(job):
            logger.warning("Prototype %s is no longer claimed by this worker", job.prototype_id)
            return


async def _sleep_unless_stopped(stop: asyncio.Event, seconds: float) -> None:
    try:
        await asyncio.wait_for(stop.wait(), timeout=seconds)
    except TimeoutError:
        pass


def _details(job: Job, result: BuildResult, log_path: str) -> dict[str, Any]:
    """The build_succeeded / build_failed event details (architecture 5.4)."""

    usage = TypeAdapter(RunUsage).dump_python(result.usage, mode="json")
    return {
        "attempt": job.attempt,
        "agent_rounds": result.agent_rounds,
        "model": result.model_name,
        "input_tokens": result.usage.input_tokens,
        "output_tokens": result.usage.output_tokens,
        "cost_usd": usage.get("cost"),
        "log_path": log_path,
        "checks": {check.name: check.exit_code for check in result.checks},
    }
