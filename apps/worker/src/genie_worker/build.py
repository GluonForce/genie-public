"""Build a prototype and check it (FR-B3): lint, type check, static export; one fix round."""

import asyncio
import logging
import time
from dataclasses import dataclass

from pydantic_ai.messages import ModelMessage
from pydantic_ai.usage import RunUsage

from genie_worker.agents.coding_agent import build_prototype, fix_prototype
from genie_worker.models.requirements import RequirementsDraft
from genie_worker.sandbox import Sandbox

logger = logging.getLogger(__name__)

_CHECK_TIMEOUT_SECONDS = 600
# In order; the first failure stops the rest, so a broken build doesn't waste minutes
CHECKS = (
    ("lint", ["pnpm", "lint"]),
    ("typecheck", ["pnpm", "exec", "tsc", "--noEmit"]),
    ("build", ["pnpm", "build"]),
)


@dataclass(frozen=True)
class CheckResult:
    name: str
    command: list[str]
    exit_code: int | None
    output: str

    @property
    def ok(self) -> bool:
        return self.exit_code == 0


@dataclass(frozen=True)
class BuildResult:
    ok: bool
    agent_rounds: int
    # Checks from the final round
    checks: list[CheckResult]
    summary: str
    model_name: str | None
    usage: RunUsage
    # The whole agent conversation across rounds, for the build log
    messages: list[ModelMessage]


def run_checks(sandbox: Sandbox) -> list[CheckResult]:
    results: list[CheckResult] = []
    for name, command in CHECKS:
        started = time.monotonic()
        result = sandbox.run(command, timeout=_CHECK_TIMEOUT_SECONDS)
        check = CheckResult(name, command, result.exit_code, result.output)
        results.append(check)
        logger.info(
            "Check %s: exit %s in %.1fs", name, result.exit_code, time.monotonic() - started
        )
        if not check.ok:
            break
    return results


async def build_and_check(
    requirements: RequirementsDraft, sandbox: Sandbox, *, build_note: str | None = None
) -> BuildResult:
    """Build, check, and if a check fails give the agent one round to fix it.

    Model and sandbox errors are raised for the caller to mark the build as failed.
    """

    output = await build_prototype(requirements, sandbox, build_note=build_note)
    usage = output.usage
    rounds = 1
    checks = await asyncio.to_thread(run_checks, sandbox)
    if not _passed(checks):
        output = await fix_prototype(output, _failure_report(checks), sandbox)
        usage = usage + output.usage
        rounds = 2
        checks = await asyncio.to_thread(run_checks, sandbox)
    return BuildResult(
        ok=_passed(checks),
        agent_rounds=rounds,
        checks=checks,
        summary=output.summary,
        model_name=output.model_name,
        usage=usage,
        messages=output.messages,
    )


def _passed(checks: list[CheckResult]) -> bool:
    return len(checks) == len(CHECKS) and all(check.ok for check in checks)


def _failure_report(checks: list[CheckResult]) -> str:
    failed = next(check for check in checks if not check.ok)
    status = "timed out" if failed.exit_code is None else f"exited with code {failed.exit_code}"
    return f"`{' '.join(failed.command)}` {status}:\n\n{failed.output}"
