"""run_job and run_worker with a fake queue, local sandbox and stubbed build, so nothing external
is called."""

import asyncio
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from local_sandbox import LocalSandbox
from pydantic_ai.usage import RunUsage

from genie_worker import jobs
from genie_worker.artifacts import ArtifactPaths
from genie_worker.build import BuildResult, CheckResult
from genie_worker.db import Job

REQUIREMENTS = {
    "title": "Habits",
    "summary": "s",
    "intent": "i",
    "functional_requirements": ["f"],
    "user_stories": ["u"],
}


def job(**overrides: Any) -> Job:
    return Job(
        **{
            "prototype_id": "p1",
            "user_id": "u1",
            "requirements": REQUIREMENTS,
            "attempt": 1,
            "build_note": None,
            "slug": "habits-abc123",
            **overrides,
        }
    )


def result(ok: bool) -> BuildResult:
    exit_code = 0 if ok else 1
    return BuildResult(
        ok=ok,
        agent_rounds=1 if ok else 2,
        checks=[CheckResult("build", ["pnpm", "build"], exit_code, "out")],
        summary="done",
        model_name="model-a",
        usage=RunUsage(input_tokens=10, output_tokens=5, cost=Decimal("0.05")),
        messages=[],
    )


class FakeQueue:
    def __init__(self, jobs_to_hand_out: list[Job] | None = None) -> None:
        self.pending = list(jobs_to_hand_out or [])
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def claim(self) -> Job | None:
        return self.pending.pop(0) if self.pending else None

    async def heartbeat(self, job: Job) -> bool:
        return True

    async def finish_success(self, job: Job, **kwargs: Any) -> bool:
        self.calls.append(("success", kwargs))
        return True

    async def finish_failure(self, job: Job, **kwargs: Any) -> bool:
        self.calls.append(("failure", kwargs))
        return True

    async def requeue(self, job: Job, reason: str) -> bool:
        self.calls.append(("requeue", {"reason": reason}))
        return True

    async def requeue_stale(self) -> int:
        return 0


class ClosingSandbox(LocalSandbox):
    closed = False

    def close(self) -> None:
        self.closed = True


@pytest.fixture
def sandbox(tmp_path: Path) -> ClosingSandbox:
    return ClosingSandbox(tmp_path)


def stub_build(build_result: BuildResult | Exception, seen: dict[str, Any] | None = None):
    async def build(requirements, sandbox, *, build_note):
        if seen is not None:
            seen["build_note"] = build_note
            seen["requirements"] = requirements
        if isinstance(build_result, Exception):
            raise build_result
        return build_result

    return build


async def stub_save(sandbox, storage, prototype_id, attempt, build_result):
    site = f"sites/{prototype_id}.tar.gz" if build_result.ok else None
    return ArtifactPaths(
        f"sources/{prototype_id}.tar.gz",
        site,
        f"logs/{prototype_id}/{attempt}.jsonl",
        site_archive=b"site" if build_result.ok else None,
    )


published: list[tuple[str, bytes | None]] = []


async def stub_publish(slug: str, site_archive: bytes | None) -> str:
    published.append((slug, site_archive))
    return f"http://{slug}.localhost:8787/"


def run_one(
    queue: FakeQueue, sandbox: ClosingSandbox, build, the_job: Job | None = None, publish=None
) -> None:
    published.clear()
    asyncio.run(
        jobs.run_job(
            the_job or job(),
            queue,
            None,
            lambda: sandbox,
            build=build,
            save=stub_save,
            publish=publish or stub_publish,
        )
    )


def test_successful_build_goes_to_qa(sandbox: ClosingSandbox) -> None:
    queue = FakeQueue()
    seen: dict[str, Any] = {}
    run_one(queue, sandbox, stub_build(result(True), seen), job(build_note="save button broken"))

    [(kind, kwargs)] = queue.calls
    assert kind == "success"
    assert kwargs["site_path"] == "sites/p1.tar.gz" and kwargs["cost_usd"] == Decimal("0.05")
    assert kwargs["site_url"] == "http://habits-abc123.localhost:8787/"
    assert published == [("habits-abc123", b"site")]
    assert kwargs["details"]["log_path"] == "logs/p1/1.jsonl"
    assert kwargs["details"]["cost_usd"] == "0.05"
    assert seen["build_note"] == "save button broken"
    assert seen["requirements"].intent == "i"  # extra "title" is ignored
    assert sandbox.closed


def test_failed_checks_record_build_failed_with_source(sandbox: ClosingSandbox) -> None:
    queue = FakeQueue()
    run_one(queue, sandbox, stub_build(result(False)))
    [(kind, kwargs)] = queue.calls
    assert kind == "failure"
    assert "`pnpm build` still failed" in kwargs["error"]
    assert kwargs["source_path"] == "sources/p1.tar.gz"
    assert sandbox.closed


def test_crash_records_build_failed_with_the_error(sandbox: ClosingSandbox) -> None:
    queue = FakeQueue()
    run_one(queue, sandbox, stub_build(RuntimeError("OpenRouter is down")))
    [(kind, kwargs)] = queue.calls
    assert kind == "failure" and "OpenRouter is down" in kwargs["error"]
    assert kwargs["source_path"] is None
    assert sandbox.closed


def test_invalid_requirements_fail_without_a_sandbox(sandbox: ClosingSandbox) -> None:
    queue = FakeQueue()
    run_one(queue, sandbox, stub_build(result(True)), job(requirements={"summary": "only"}))
    [(kind, kwargs)] = queue.calls
    assert kind == "failure" and "ValidationError" in kwargs["error"]
    assert not sandbox.closed


def test_worker_requeues_the_job_when_stopped_mid_build(
    sandbox: ClosingSandbox, monkeypatch: pytest.MonkeyPatch
) -> None:
    started = asyncio.Event()

    async def slow_build(requirements, sandbox, *, build_note):
        started.set()
        await asyncio.sleep(60)

    async def scenario() -> FakeQueue:
        queue = FakeQueue([job()])
        stop = asyncio.Event()
        original = jobs.run_job

        async def run_job(*args, **kwargs):
            return await original(
                *args, build=slow_build, save=stub_save, publish=stub_publish, **kwargs
            )

        monkeypatch.setattr(jobs, "run_job", run_job)
        worker = asyncio.create_task(jobs.run_worker(queue, None, lambda: sandbox, stop))
        await asyncio.wait_for(started.wait(), 5)
        stop.set()
        await asyncio.wait_for(worker, 5)
        return queue

    queue = asyncio.run(scenario())
    assert queue.calls == [("requeue", {"reason": "worker shut down during the build"})]
    assert sandbox.closed


def test_publish_failure_keeps_cost_and_source(sandbox: ClosingSandbox) -> None:
    async def failing_publish(slug: str, site_archive: bytes | None) -> str:
        raise RuntimeError("R2 is down")

    queue = FakeQueue()
    run_one(queue, sandbox, stub_build(result(True)), publish=failing_publish)
    [(kind, kwargs)] = queue.calls
    assert kind == "failure" and "R2 is down" in kwargs["error"]
    assert kwargs["cost_usd"] == Decimal("0.05")
    assert kwargs["source_path"] == "sources/p1.tar.gz"
    assert sandbox.closed
