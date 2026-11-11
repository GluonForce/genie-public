"""Save a build's outputs to Storage (FR-B4): source and site as .tar.gz, plus the build log."""

import asyncio
import json
from dataclasses import dataclass, field

from pydantic import TypeAdapter
from pydantic_ai.messages import ModelMessagesTypeAdapter
from pydantic_ai.usage import RunUsage

from genie_worker.build import BuildResult
from genie_worker.sandbox import Sandbox
from genie_worker.storage import Storage

# Left out of the source tarball; out/ is saved separately as the site
SOURCE_EXCLUDES = frozenset({"node_modules", ".next", "out", ".git", ".turbo"})
_GZIP = "application/gzip"


@dataclass(frozen=True)
class ArtifactPaths:
    source_path: str
    # None when the build failed: there is no site to publish
    site_path: str | None
    log_path: str
    # The packed site, passed on for publishing so the sandbox isn't asked twice
    site_archive: bytes | None = field(default=None, repr=False)


async def save_artifacts(
    sandbox: Sandbox, storage: Storage, prototype_id: str, attempt: int, result: BuildResult
) -> ArtifactPaths:
    source = await asyncio.to_thread(sandbox.pack, ".", SOURCE_EXCLUDES)
    source_path = await storage.upload("sources", f"{prototype_id}.tar.gz", source, _GZIP)
    site_path = None
    site = None
    if result.ok:
        site = await asyncio.to_thread(sandbox.pack, "out", frozenset())
        site_path = await storage.upload("sites", f"{prototype_id}.tar.gz", site, _GZIP)
    log_path = await storage.upload(
        "logs",
        f"{prototype_id}/{attempt}.jsonl",
        build_log(attempt, result).encode(),
        "application/x-ndjson",
    )
    return ArtifactPaths(
        source_path=source_path, site_path=site_path, log_path=log_path, site_archive=site
    )


def build_log(attempt: int, result: BuildResult) -> str:
    """One JSON object per line: the outcome, each check, then every message of the agent run."""

    lines = [
        {
            "type": "build",
            "attempt": attempt,
            "ok": result.ok,
            "agent_rounds": result.agent_rounds,
            "model": result.model_name,
            "usage": TypeAdapter(RunUsage).dump_python(result.usage, mode="json"),
            "summary": result.summary,
        },
        *(
            {
                "type": "check",
                "name": check.name,
                "command": check.command,
                "exit_code": check.exit_code,
                "output": check.output,
            }
            for check in result.checks
        ),
        *(
            {"type": "message", **message}
            for message in ModelMessagesTypeAdapter.dump_python(result.messages, mode="json")
        ),
    ]
    return "".join(json.dumps(line, ensure_ascii=False) + "\n" for line in lines)
