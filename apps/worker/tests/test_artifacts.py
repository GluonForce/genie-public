"""save_artifacts against a local sandbox and a fake Supabase Storage."""

import asyncio
import io
import json
import tarfile
from pathlib import Path

import httpx
import pytest
from local_sandbox import LocalSandbox
from pydantic_ai.messages import ModelRequest, UserPromptPart
from pydantic_ai.usage import RunUsage

from genie_worker.artifacts import save_artifacts
from genie_worker.build import BuildResult, CheckResult
from genie_worker.storage import Storage, StorageError

PROTOTYPE_ID = "0b6c2a8e-0000-4000-8000-000000000001"


def result(ok: bool) -> BuildResult:
    return BuildResult(
        ok=ok,
        agent_rounds=1,
        checks=[CheckResult("lint", ["pnpm", "lint"], 0 if ok else 1, "lint output")],
        summary="built",
        model_name="model-a",
        usage=RunUsage(requests=3, input_tokens=100),
        messages=[ModelRequest(parts=[UserPromptPart(content="Build it")])],
    )


@pytest.fixture
def sandbox(tmp_path: Path) -> LocalSandbox:
    sandbox = LocalSandbox(tmp_path)
    for path in [
        "package.json",
        "src/app/page.tsx",
        "node_modules/next/x.js",
        ".next/x",
        "out/index.html",
    ]:
        sandbox.write_text(path, path)
    return sandbox


class FakeStorage:
    def __init__(self, status: int = 200) -> None:
        self.uploads: dict[str, tuple[bytes, dict[str, str]]] = {}
        self.status = status

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.uploads[request.url.path] = (request.content, dict(request.headers))
        return httpx.Response(self.status, json={})

    def storage(self) -> Storage:
        client = httpx.AsyncClient(
            base_url="https://x.supabase.co/storage/v1", transport=httpx.MockTransport(self.handler)
        )
        return Storage(client)


def names(archive: bytes) -> set[str]:
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
        return {member.name for member in tar.getmembers() if member.isfile()}


def test_successful_build_saves_source_site_and_log(sandbox: LocalSandbox) -> None:
    fake = FakeStorage()
    paths = asyncio.run(save_artifacts(sandbox, fake.storage(), PROTOTYPE_ID, 1, result(True)))

    assert paths.source_path == f"sources/{PROTOTYPE_ID}.tar.gz"
    assert paths.site_path == f"sites/{PROTOTYPE_ID}.tar.gz"
    assert paths.log_path == f"logs/{PROTOTYPE_ID}/1.jsonl"

    source, headers = fake.uploads[f"/storage/v1/object/sources/{PROTOTYPE_ID}.tar.gz"]
    assert names(source) == {"./package.json", "./src/app/page.tsx"}
    assert headers["x-upsert"] == "true"
    site, _ = fake.uploads[f"/storage/v1/object/sites/{PROTOTYPE_ID}.tar.gz"]
    assert names(site) == {"./index.html"}

    log, _ = fake.uploads[f"/storage/v1/object/logs/{PROTOTYPE_ID}/1.jsonl"]
    lines = [json.loads(line) for line in log.decode().splitlines()]
    assert [line["type"] for line in lines] == ["build", "check", "message"]
    assert lines[0]["ok"] is True and lines[0]["usage"]["input_tokens"] == 100


def test_failed_build_saves_no_site(sandbox: LocalSandbox) -> None:
    fake = FakeStorage()
    paths = asyncio.run(save_artifacts(sandbox, fake.storage(), PROTOTYPE_ID, 2, result(False)))
    assert paths.site_path is None
    assert not any("/sites/" in path for path in fake.uploads)
    assert f"/storage/v1/object/logs/{PROTOTYPE_ID}/2.jsonl" in fake.uploads


def test_storage_errors_are_raised(sandbox: LocalSandbox) -> None:
    with pytest.raises(StorageError, match="403"):
        asyncio.run(
            save_artifacts(sandbox, FakeStorage(403).storage(), PROTOTYPE_ID, 1, result(True))
        )
