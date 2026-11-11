"""build_and_check with the agent stubbed out, so no model is called."""

import asyncio
from pathlib import Path

import pytest
from local_sandbox import LocalSandbox
from pydantic_ai.usage import RunUsage

from genie_worker import build
from genie_worker.agents.coding_agent import BuildOutput
from genie_worker.models.requirements import RequirementsDraft
from genie_worker.sandbox import CommandResult

REQUIREMENTS = RequirementsDraft(
    summary="s", intent="i", functional_requirements=["f"], user_stories=["u"]
)
FAIL = CommandResult(exit_code=1, output="Type error: x is not defined")


class StubAgent:
    def __init__(self) -> None:
        self.fix_reports: list[str] = []

    async def build(
        self, requirements: RequirementsDraft, sandbox: LocalSandbox, *, build_note: str | None
    ) -> BuildOutput:
        self.build_note = build_note
        return BuildOutput("built", "model-a", RunUsage(requests=3, input_tokens=100), [])

    async def fix(self, previous: BuildOutput, report: str, sandbox: LocalSandbox) -> BuildOutput:
        self.fix_reports.append(report)
        return BuildOutput("fixed", "model-a", RunUsage(requests=2, input_tokens=50), [])


@pytest.fixture
def stub(monkeypatch: pytest.MonkeyPatch) -> StubAgent:
    stub = StubAgent()
    monkeypatch.setattr(build, "build_prototype", stub.build)
    monkeypatch.setattr(build, "fix_prototype", stub.fix)
    return stub


@pytest.fixture
def sandbox(tmp_path: Path) -> LocalSandbox:
    return LocalSandbox(tmp_path)


def run(sandbox: LocalSandbox) -> build.BuildResult:
    return asyncio.run(build.build_and_check(REQUIREMENTS, sandbox))


def test_passing_checks_need_no_fix(stub: StubAgent, sandbox: LocalSandbox) -> None:
    result = run(sandbox)
    assert result.ok and result.agent_rounds == 1
    assert [c.name for c in result.checks] == ["lint", "typecheck", "build"]
    assert stub.fix_reports == []


def test_failed_build_is_fixed_in_one_round(stub: StubAgent, sandbox: LocalSandbox) -> None:
    sandbox.scripted["pnpm build"] = [FAIL]
    result = run(sandbox)
    assert result.ok and result.agent_rounds == 2
    assert result.summary == "fixed"
    assert result.usage.requests == 5 and result.usage.input_tokens == 150
    assert "`pnpm build` exited with code 1" in stub.fix_reports[0]
    assert "x is not defined" in stub.fix_reports[0]


def test_failing_twice_is_not_ok(stub: StubAgent, sandbox: LocalSandbox) -> None:
    sandbox.scripted["pnpm build"] = [FAIL, FAIL]
    result = run(sandbox)
    assert not result.ok and result.agent_rounds == 2
    assert result.checks[-1].name == "build" and "x is not defined" in result.checks[-1].output


def test_first_failure_stops_the_other_checks(stub: StubAgent, sandbox: LocalSandbox) -> None:
    sandbox.scripted["pnpm lint"] = [FAIL, FAIL]
    result = run(sandbox)
    assert not result.ok
    assert [c.name for c in result.checks] == ["lint"]
    assert sandbox.commands == [["pnpm", "lint"], ["pnpm", "lint"]]


def test_timeout_is_reported(stub: StubAgent, sandbox: LocalSandbox) -> None:
    sandbox.scripted["pnpm build"] = [CommandResult(exit_code=None, output="")]
    run(sandbox)
    assert "`pnpm build` timed out" in stub.fix_reports[0]
