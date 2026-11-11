"""SiteStore with a fake S3 client and StateStore with a fake Cloudflare API."""

import asyncio
import io
import tarfile
from typing import Any

import httpx
import pytest

from genie_worker.publish import PublishError, SiteStore, StateStore, content_type


def archive(files: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        for name, data in files.items():
            info = tarfile.TarInfo(f"./{name}")
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    return buffer.getvalue()


class FakeS3:
    def __init__(self, existing: list[str] | None = None) -> None:
        self.objects: dict[str, dict[str, Any]] = {key: {} for key in existing or []}
        self.deleted: list[str] = []

    def put_object(self, *, Bucket: str, Key: str, Body: bytes, ContentType: str) -> None:
        self.objects[Key] = {"body": Body, "type": ContentType}

    def delete_objects(self, *, Bucket: str, Delete: dict[str, Any]) -> None:
        for item in Delete["Objects"]:
            self.deleted.append(item["Key"])
            self.objects.pop(item["Key"], None)

    def get_paginator(self, name: str) -> "FakeS3":
        return self

    def paginate(self, *, Bucket: str, Prefix: str) -> list[dict[str, Any]]:
        return [{"Contents": [{"Key": k} for k in self.objects if k.startswith(Prefix)]}]


SITE = {
    "index.html": b"<html></html>",
    "404.html": b"missing",
    "_next/static/chunks/app.js": b"js",
    "__next._tree.txt": b"rsc",
}


def test_publish_uploads_files_with_types() -> None:
    s3 = FakeS3()
    count = SiteStore(s3, "bucket").publish("habits-abc123", archive(SITE))
    assert count == 4
    assert set(s3.objects) == {f"sites/habits-abc123/{path}" for path in SITE}
    assert s3.objects["sites/habits-abc123/index.html"]["type"] == "text/html; charset=utf-8"
    assert s3.objects["sites/habits-abc123/_next/static/chunks/app.js"]["type"].startswith(
        "text/javascript"
    )


def test_rebuild_removes_leftover_files_only_for_this_slug() -> None:
    s3 = FakeS3(["sites/habits-abc123/old.html", "sites/other-xyz789/index.html"])
    SiteStore(s3, "bucket").publish("habits-abc123", archive(SITE))
    assert s3.deleted == ["sites/habits-abc123/old.html"]
    assert "sites/other-xyz789/index.html" in s3.objects


def test_site_without_index_is_refused() -> None:
    with pytest.raises(PublishError, match="index.html"):
        SiteStore(FakeS3(), "bucket").publish("x-abc123", archive({"404.html": b""}))


def test_unsafe_archive_paths_are_refused() -> None:
    bad = archive({"index.html": b"", "../../escape.html": b""})
    with pytest.raises(PublishError, match="Unsafe path"):
        SiteStore(FakeS3(), "bucket").publish("x-abc123", bad)


def test_kv_state_is_put_under_the_slug() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"success": True})

    client = httpx.AsyncClient(
        base_url="https://kv.test/ns", transport=httpx.MockTransport(handler)
    )
    asyncio.run(StateStore(client).set_state("habits-abc123", "preview"))
    assert requests[0].method == "PUT"
    assert requests[0].url.path == "/ns/values/habits-abc123"
    assert requests[0].content == b"preview"


def test_kv_errors_are_raised() -> None:
    client = httpx.AsyncClient(
        base_url="https://kv.test/ns",
        transport=httpx.MockTransport(lambda r: httpx.Response(401, json={"success": False})),
    )
    with pytest.raises(PublishError, match="401"):
        asyncio.run(StateStore(client).set_state("habits-abc123", "preview"))


def test_content_types() -> None:
    assert content_type("a/b.css") == "text/css; charset=utf-8"
    assert content_type("font.woff2") == "font/woff2"
    assert content_type("blob.unknownext") == "application/octet-stream"
