"""Publish a built site (FR-B5): files to R2 under sites/{slug}/, state to Workers KV.

The prototype host Worker (infra/proto-host) serves sites/{slug}/ at {slug}.<PROTO_BASE_DOMAIN>
according to the KV state.
"""

import io
import logging
import mimetypes
import posixpath
import tarfile
from concurrent.futures import ThreadPoolExecutor
from functools import cache
from typing import Any, Literal

import boto3
import httpx

from genie_worker.core.config import settings

logger = logging.getLogger(__name__)

SiteState = Literal["preview", "live", "expired", "offline"]

_UPLOAD_THREADS = 8
_DELETE_BATCH = 1000
# Windows reads MIME types from the registry, which is unreliable; these cover a Next.js export
_CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".txt": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
}


class PublishError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class SiteStore:
    """The static sites bucket in R2, through its S3-compatible API."""

    def __init__(self, s3: Any, bucket: str) -> None:
        self._s3 = s3
        self._bucket = bucket

    def publish(self, slug: str, site_archive: bytes) -> int:
        """Upload every file of the site, then remove files left over from an earlier build."""

        prefix = f"sites/{slug}/"
        files = _read_archive(site_archive)
        if "index.html" not in files:
            raise PublishError("The static site has no index.html")
        with ThreadPoolExecutor(_UPLOAD_THREADS) as pool:
            list(
                pool.map(
                    lambda item: self._s3.put_object(
                        Bucket=self._bucket,
                        Key=prefix + item[0],
                        Body=item[1],
                        ContentType=content_type(item[0]),
                    ),
                    files.items(),
                )
            )
        new_keys = {prefix + path for path in files}
        leftovers = [key for key in self._keys(prefix) if key not in new_keys]
        for start in range(0, len(leftovers), _DELETE_BATCH):
            batch = leftovers[start : start + _DELETE_BATCH]
            self._s3.delete_objects(
                Bucket=self._bucket, Delete={"Objects": [{"Key": key} for key in batch]}
            )
        logger.info(
            "Published %s files to %s (%s leftovers removed)", len(files), prefix, len(leftovers)
        )
        return len(files)

    def _keys(self, prefix: str) -> list[str]:
        keys: list[str] = []
        for page in self._s3.get_paginator("list_objects_v2").paginate(
            Bucket=self._bucket, Prefix=prefix
        ):
            keys.extend(item["Key"] for item in page.get("Contents", []))
        return keys


class StateStore:
    """Each prototype's state in Workers KV, keyed by slug, read by the prototype host."""

    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def set_state(self, slug: str, state: SiteState) -> None:
        response = await self._client.put(f"/values/{slug}", content=state.encode())
        if response.is_error:
            raise PublishError(
                f"Setting KV state of {slug} to {state} failed: "
                f"{response.status_code} {response.text}"
            )


def site_url(slug: str) -> str:
    domain = settings.proto_base_domain
    scheme = "http" if domain.startswith("localhost") else "https"
    return f"{scheme}://{slug}.{domain}/"


def content_type(path: str) -> str:
    extension = posixpath.splitext(path)[1].lower()
    return (
        _CONTENT_TYPES.get(extension) or mimetypes.guess_type(path)[0] or "application/octet-stream"
    )


def _read_archive(archive: bytes) -> dict[str, bytes]:
    files: dict[str, bytes] = {}
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
        for member in tar.getmembers():
            if not member.isfile():
                continue
            path = posixpath.normpath(member.name)
            if path.startswith("../") or path.startswith("/"):
                raise PublishError(f"Unsafe path in the site archive: {member.name}")
            extracted = tar.extractfile(member)
            if extracted is not None:
                files[path] = extracted.read()
    return files


@cache
def site_store() -> SiteStore:
    if not (settings.cloudflare_account_id and settings.r2_access_key_id and settings.r2_bucket):
        raise PublishError("CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_BUCKET must be set")
    s3 = boto3.client(
        "s3",
        endpoint_url=f"https://{settings.cloudflare_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
    )
    return SiteStore(s3, settings.r2_bucket)


@cache
def state_store() -> StateStore:
    if not (settings.cloudflare_api_token and settings.cloudflare_kv_namespace_id):
        raise PublishError("CLOUDFLARE_API_TOKEN and CLOUDFLARE_KV_NAMESPACE_ID must be set")
    return StateStore(
        httpx.AsyncClient(
            base_url=(
                "https://api.cloudflare.com/client/v4/accounts/"
                f"{settings.cloudflare_account_id}/storage/kv/namespaces/"
                f"{settings.cloudflare_kv_namespace_id}"
            ),
            headers={"authorization": f"Bearer {settings.cloudflare_api_token}"},
            timeout=30.0,
        )
    )
