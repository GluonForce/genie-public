import asyncio
import logging
import posixpath
import re
import threading
import time
from collections.abc import AsyncIterable
from dataclasses import dataclass
from functools import cache
from pathlib import Path

from pydantic_ai import Agent, RunContext
from pydantic_ai.exceptions import (
    AgentRunError,
    FallbackExceptionGroup,
    ModelHTTPError,
    ModelRetry,
    UserError,
)
from pydantic_ai.messages import (
    AgentStreamEvent,
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    ModelMessage,
    PartEndEvent,
    RetryPromptPart,
    TextPart,
    ThinkingPart,
)
from pydantic_ai.models.openrouter import OpenRouterModelSettings
from pydantic_ai.usage import RunUsage, UsageLimits

from genie_worker.core.config import settings
from genie_worker.core.openrouter import (
    agent_model,
    fallback_failure_message,
    log_agent_finish,
    log_agent_start,
    reasoning_settings,
)
from genie_worker.core.platforms import WEB, PlatformProfile
from genie_worker.models.requirements import RequirementsDraft
from genie_worker.sandbox import Sandbox

logger = logging.getLogger(__name__)

_REQUEST_LIMIT = 250
_MAX_READ_BYTES = 200_000
_MAX_LISTED_FILES = 500
_PNPM_TIMEOUT_SECONDS = 600
_LONG_RUNNING_SCRIPTS = {"dev", "start"}
# Expo commands that start a server, need native tooling, or leave Expo Go; Genie serves the app itself.
_BLOCKED_EXPO_COMMANDS = {"start", "run:ios", "run:android", "prebuild"}
_FILE_WRITE_LOCK = threading.Lock()
_UNPORTABLE_COMMANDS = {
    "sh",
    "bash",
    "zsh",
    "cmd",
    "cmd.exe",
    "powershell",
    "pwsh",
    "sed",
    "awk",
    "grep",
    "cat",
    "echo",
    "ls",
    "rm",
    "mv",
    "cp",
    "mkdir",
    "touch",
    "find",
    "head",
    "tail",
    "node",
    "python",
    "python3",
}
_LOG_PREVIEW_CHARS = 300


def _runtime_instructions(profile: PlatformProfile) -> str:
    return f"""
## Runtime Environment

- Your tools operate inside the project directory. Every path you pass is relative to it.
- There is no shell: `sh`, `sed`, `grep`, `cat` and similar commands are not available.
- Create and change files only with `write_file` (whole file) and `edit_file` (one exact replacement; best for small changes such as a title).
- Run package and project commands only through `run_pnpm`, which executes `pnpm <args>` in the project directory. Use it for {profile.pnpm_usage}. Do not use npm, yarn or npx.
- Never run `pnpm dev` or `pnpm start`. Genie builds and publishes the static site itself after you finish.
{profile.generating_instructions}
- When you are done, reply with a short plain-text summary of what you built, which checks you ran and their results, and any limitations.
""".strip()


@dataclass(frozen=True)
class BuildDeps:
    profile: PlatformProfile
    sandbox: Sandbox


@dataclass(frozen=True)
class BuildOutput:
    summary: str
    model_name: str | None
    usage: RunUsage
    # The whole conversation, so a fix round can continue it
    messages: list[ModelMessage]


class CodingModelError(Exception):
    """The coding agent could not build the prototype."""

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@cache
def _agent() -> Agent[BuildDeps, str]:
    agent = Agent(
        agent_model(settings.coding_agent, settings.fallback_coding_agent),
        deps_type=BuildDeps,
        output_type=str,
        retries=3,
    )
    agent.tool(list_files)
    agent.tool(read_file)
    agent.tool(write_file)
    agent.tool(edit_file)
    agent.tool(delete_file)
    agent.tool(run_pnpm_command, name="run_pnpm")
    return agent


async def build_prototype(
    requirements: RequirementsDraft,
    sandbox: Sandbox,
    profile: PlatformProfile = WEB,
    *,
    build_note: str | None = None,
) -> BuildOutput:
    """Run the coding agent against a sandbox that already holds the scaffolded template.

    build_note is an admin's description of defects in the previous build (QA rebuild).
    """

    requirements_json = RequirementsDraft.model_validate(requirements.model_dump()).model_dump_json(
        indent=2
    )
    prompt = f"Build the prototype for these requirements:\n\n{requirements_json}"
    if build_note:
        prompt += (
            "\n\nAn earlier build of these requirements was rejected in review. Make sure this "
            f"build does not have the same defects:\n\n{build_note}"
        )
    return await _run(prompt, sandbox, profile, label=f"Coding (generating {profile.platform})")


async def fix_prototype(
    previous: BuildOutput,
    failure_report: str,
    sandbox: Sandbox,
    profile: PlatformProfile = WEB,
) -> BuildOutput:
    """Continue the build conversation with the checks that failed, so the agent can fix them."""

    prompt = (
        "The checks failed after you finished. Fix the errors below, then run `pnpm build` "
        f"again:\n\n{failure_report}"
    )
    return await _run(
        prompt,
        sandbox,
        profile,
        label=f"Coding (fixing {profile.platform})",
        message_history=previous.messages,
    )


async def _run(
    prompt: str,
    sandbox: Sandbox,
    profile: PlatformProfile,
    *,
    label: str,
    message_history: list[ModelMessage] | None = None,
) -> BuildOutput:
    if not settings.coding_agent.strip():
        raise CodingModelError("CODING_AGENT is not set in .env")
    context_path = profile.generation_context
    instructions = _context_instructions(context_path)
    if instructions is None:
        raise CodingModelError(f"Coding agent instructions are missing: add them to {context_path}")
    try:
        agent = _agent()
    except UserError as exc:
        raise CodingModelError(f"CODING_AGENT is not a valid OpenRouter model: {exc}") from exc

    runtime_instructions = _runtime_instructions(profile)
    log_agent_start(
        label,
        settings.coding_agent,
        settings.fallback_coding_agent,
        settings.coding_agent_effort,
    )
    try:
        result = await agent.run(
            prompt,
            message_history=message_history,
            deps=BuildDeps(profile=profile, sandbox=sandbox),
            instructions=f"{instructions}\n\n{runtime_instructions}",
            # Prompt caching: instructions, tools and the growing conversation are re-read from
            # the provider's cache on each request (about 0.1x the input price on Anthropic)
            model_settings=OpenRouterModelSettings(
                cache=True, **(reasoning_settings(settings.coding_agent_effort) or {})
            ),
            usage_limits=UsageLimits(request_limit=_REQUEST_LIMIT),
            event_stream_handler=_log_events,
        )
    except ModelHTTPError as exc:
        raise CodingModelError(
            f"OpenRouter coding request failed: {exc.message}",
            status_code=exc.status_code,
        ) from exc
    except FallbackExceptionGroup as exc:
        raise CodingModelError(
            f"Every coding model failed: {fallback_failure_message(exc)}"
        ) from exc
    except AgentRunError as exc:
        raise CodingModelError(f"Coding agent failed: {exc.message}") from exc
    log_agent_finish(label, result.response.model_name)
    return BuildOutput(
        summary=result.output,
        model_name=result.response.model_name,
        usage=result.usage,
        messages=result.all_messages(),
    )


def list_files(ctx: RunContext[BuildDeps], path: str = ".") -> str:
    """List files under a directory of the prototype, recursively. node_modules and build output are skipped.

    Args:
        path: Directory relative to the project root. Defaults to the prototype root.
    """

    files = ctx.deps.sandbox.list_files(_resolve(path), ctx.deps.profile.skipped_dirs)
    if files is None:
        raise ModelRetry(f"{path} is not a directory")
    if len(files) > _MAX_LISTED_FILES:
        return "\n".join(
            [*files[:_MAX_LISTED_FILES], f"... truncated after {_MAX_LISTED_FILES} files"]
        )
    return "\n".join(files) or "(empty)"


def read_file(ctx: RunContext[BuildDeps], path: str) -> str:
    """Read a text file of the prototype.

    Args:
        path: File relative to the project root.
    """

    data = ctx.deps.sandbox.read_bytes(_resolve(path))
    if data is None:
        raise ModelRetry(f"{path} does not exist")
    if len(data) > _MAX_READ_BYTES:
        raise ModelRetry(f"{path} is larger than {_MAX_READ_BYTES} bytes")
    return data.decode("utf-8", errors="replace")


def write_file(ctx: RunContext[BuildDeps], path: str, content: str) -> str:
    """Create or overwrite a file of the prototype with the complete new content.

    Args:
        path: File relative to the project root. Missing parent directories are created.
        content: The full file content.
    """

    _check_file_name(path)
    file = _resolve(path)
    with _FILE_WRITE_LOCK:
        ctx.deps.sandbox.write_text(file, content)
    return f"Wrote {path}"


def edit_file(ctx: RunContext[BuildDeps], path: str, old_text: str, new_text: str) -> str:
    """Replace one exact piece of text in an existing file of the prototype. Prefer this over write_file for small changes.

    Args:
        path: File relative to the project root.
        old_text: Text to replace, copied exactly from the file. It must occur exactly once, so include enough surrounding lines to be unique.
        new_text: The replacement text. May be empty to delete old_text.
    """

    file = _resolve(path)
    if not old_text:
        raise ModelRetry("old_text must not be empty; use write_file to create or replace a file")
    # Tool calls from one model turn run in parallel threads; without the lock, two edits to one file lose an update.
    with _FILE_WRITE_LOCK:
        data = ctx.deps.sandbox.read_bytes(file)
        if data is None:
            raise ModelRetry(f"{path} does not exist")
        text = data.decode("utf-8", errors="replace").replace("\r\n", "\n")
        occurrences = text.count(old_text)
        if occurrences == 0:
            raise ModelRetry(
                f"old_text was not found in {path}; read the file again and copy the text exactly"
            )
        if occurrences > 1:
            raise ModelRetry(
                f"old_text occurs {occurrences} times in {path}; include more surrounding lines so it is unique"
            )
        ctx.deps.sandbox.write_text(file, text.replace(old_text, new_text, 1))
    return f"Edited {path}"


def delete_file(ctx: RunContext[BuildDeps], path: str) -> str:
    """Delete a file of the prototype.

    Args:
        path: File relative to the project root.
    """

    if not ctx.deps.sandbox.delete_file(_resolve(path)):
        raise ModelRetry(f"{path} does not exist")
    return f"Deleted {path}"


async def run_pnpm_command(ctx: RunContext[BuildDeps], args: list[str]) -> str:
    """Run `pnpm <args>` in the project root, for example ["install"], ["add", "zod"], ["lint"], ["build"] or ["exec", "tsc", "--noEmit"].

    Args:
        args: Arguments after `pnpm`, one per item.
    """

    script = args[1] if args[:1] == ["run"] and len(args) > 1 else (args[0] if args else "")
    if script in _LONG_RUNNING_SCRIPTS:
        raise ModelRetry(
            f"Do not run `pnpm {script}`; Genie builds and publishes the static site after you finish"
        )
    if args[:2] == ["exec", "expo"] and len(args) > 2 and args[2] in _BLOCKED_EXPO_COMMANDS:
        raise ModelRetry(
            f"Do not run `expo {args[2]}`; Genie serves the prototype in Expo Go after you finish"
        )
    if args[:1] in (["exec"], ["dlx"]) and len(args) > 1 and args[1] in {"eas", "eas-cli"}:
        raise ModelRetry("Do not use EAS; the prototype runs in Expo Go without a build")
    if args[:1] == ["exec"] and len(args) > 1 and args[1].lower() in _UNPORTABLE_COMMANDS:
        raise ModelRetry(
            f"`{args[1]}` is not available. "
            "Use edit_file or write_file to change files, and run_pnpm only for pnpm and the project's own tools"
        )
    started = time.monotonic()
    result = await asyncio.to_thread(
        ctx.deps.sandbox.run, ["pnpm", *args], timeout=_PNPM_TIMEOUT_SECONDS
    )
    status = "timed out" if result.exit_code is None else f"exited with code {result.exit_code}"
    logger.info(
        "Coding agent ran pnpm %s: %s in %.1fs",
        " ".join(args),
        status,
        time.monotonic() - started,
    )
    return f"pnpm {' '.join(args)} {status}\n{result.output}"


async def _log_events(_: RunContext[BuildDeps], events: AsyncIterable[AgentStreamEvent]) -> None:
    """Log the agent's thinking, messages and tool activity as the run progresses."""

    async for event in events:
        if isinstance(event, PartEndEvent) and isinstance(event.part, ThinkingPart):
            if event.part.content.strip():
                logger.info("Thinking: %s", event.part.content.strip())
        elif isinstance(event, PartEndEvent) and isinstance(event.part, TextPart):
            if event.part.content.strip():
                logger.info("Says: %s", event.part.content.strip())
        elif isinstance(event, FunctionToolCallEvent):
            logger.info(
                "Tool call: %s(%s)",
                event.part.tool_name,
                _preview(event.part.args_as_json_str()),
            )
        elif isinstance(event, FunctionToolResultEvent):
            label = "Tool retry" if isinstance(event.part, RetryPromptPart) else "Tool result"
            logger.info(
                "%s: %s -> %s",
                label,
                event.part.tool_name,
                _preview(str(event.part.content)),
            )


def _preview(text: str) -> str:
    text = " ".join(text.split())
    if len(text) <= _LOG_PREVIEW_CHARS:
        return text
    return f"{text[:_LOG_PREVIEW_CHARS]}... ({len(text)} chars)"


_FILE_NAME_PATTERN = re.compile(r"[A-Za-z0-9._()\[\]@+~=,-]+")


def _check_file_name(path: str) -> None:
    """Reject paths that are clearly malformed tool output, such as stray quotes or brackets."""

    parts = [part for part in path.replace("\\", "/").split("/") if part]
    if not parts or not all(
        _FILE_NAME_PATTERN.fullmatch(part) and part.strip(". ") for part in parts
    ):
        raise ModelRetry(
            f"{path!r} is not a valid file path; use plain relative paths such as src/app/page.tsx"
        )
    if not re.search(r"[A-Za-z0-9]", parts[-1]):
        raise ModelRetry(f"{path!r} is not a valid file name")


def _resolve(path: str) -> str:
    """The path relative to the project root, normalised; refuses anything outside it."""

    normalized = path.replace("\\", "/")
    resolved = posixpath.normpath(normalized)
    if normalized.startswith("/") or resolved == ".." or resolved.startswith("../"):
        raise ModelRetry(f"{path} is outside the project directory")
    return resolved


def _context_instructions(path: Path) -> str | None:
    """Instructions from a context file, re-read on every run so edits apply immediately."""

    try:
        text = path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return None
    return text or None
