"""The coding agent's tools against a local folder, which also shows they don't depend on E2B."""

import asyncio
from pathlib import Path
from types import SimpleNamespace

import pytest
from local_sandbox import LocalSandbox
from pydantic_ai.exceptions import ModelRetry

from genie_worker.agents import coding_agent as agent
from genie_worker.core.platforms import WEB


@pytest.fixture
def sandbox(tmp_path: Path) -> LocalSandbox:
    return LocalSandbox(tmp_path)


@pytest.fixture
def ctx(sandbox: LocalSandbox) -> SimpleNamespace:
    # The tools only read ctx.deps
    return SimpleNamespace(deps=agent.BuildDeps(profile=WEB, sandbox=sandbox))


def test_write_read_edit_delete(ctx: SimpleNamespace) -> None:
    agent.write_file(ctx, "src/app/page.tsx", "export default function Page() {}\n")
    assert agent.read_file(ctx, "src/app/page.tsx") == "export default function Page() {}\n"

    agent.edit_file(ctx, "src/app/page.tsx", "Page", "Home")
    assert "function Home()" in agent.read_file(ctx, "src/app/page.tsx")

    agent.delete_file(ctx, "src/app/page.tsx")
    with pytest.raises(ModelRetry):
        agent.read_file(ctx, "src/app/page.tsx")


def test_edit_needs_a_unique_match(ctx: SimpleNamespace) -> None:
    agent.write_file(ctx, "a.ts", "x x")
    with pytest.raises(ModelRetry, match="occurs 2 times"):
        agent.edit_file(ctx, "a.ts", "x", "y")
    with pytest.raises(ModelRetry, match="not found"):
        agent.edit_file(ctx, "a.ts", "z", "y")


def test_list_skips_dependencies_and_build_output(ctx: SimpleNamespace) -> None:
    for path in ["src/app/page.tsx", "node_modules/next/index.js", ".next/x", "out/index.html"]:
        agent.write_file(ctx, path, "")
    assert agent.list_files(ctx) == "src/app/page.tsx"
    with pytest.raises(ModelRetry, match="not a directory"):
        agent.list_files(ctx, "missing")


@pytest.mark.parametrize("path", ["../secret", "/etc/passwd", "src/../../x", "..\\x"])
def test_paths_outside_the_project_are_refused(ctx: SimpleNamespace, path: str) -> None:
    with pytest.raises(ModelRetry, match="outside the project"):
        agent.read_file(ctx, path)


def test_pnpm_runs_in_the_sandbox(ctx: SimpleNamespace, sandbox: LocalSandbox) -> None:
    output = asyncio.run(agent.run_pnpm_command(ctx, ["build"]))
    assert sandbox.commands == [["pnpm", "build"]]
    assert output.startswith("pnpm build exited with code 0")


@pytest.mark.parametrize("args", [["dev"], ["run", "start"], ["exec", "bash"], ["exec", "cat"]])
def test_blocked_pnpm_commands(
    ctx: SimpleNamespace, sandbox: LocalSandbox, args: list[str]
) -> None:
    with pytest.raises(ModelRetry):
        asyncio.run(agent.run_pnpm_command(ctx, args))
    assert sandbox.commands == []
