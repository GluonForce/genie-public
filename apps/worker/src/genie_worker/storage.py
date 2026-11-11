"""Supabase Storage over its REST API (the buckets are private; the secret key bypasses RLS)."""

from functools import cache

import httpx

from genie_worker.core.config import settings

_TIMEOUT_SECONDS = 120.0


class StorageError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class Storage:
    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def upload(self, bucket: str, path: str, data: bytes, content_type: str) -> str:
        """Upload or overwrite a file and return its `bucket/path`."""

        response = await self._client.post(
            f"/object/{bucket}/{path}",
            content=data,
            headers={"content-type": content_type, "x-upsert": "true"},
        )
        if response.is_error:
            raise StorageError(
                f"Uploading {bucket}/{path} failed: {response.status_code} {response.text}"
            )
        return f"{bucket}/{path}"

    async def delete(self, bucket: str, paths: list[str]) -> None:
        response = await self._client.request(
            "DELETE", f"/object/{bucket}", json={"prefixes": paths}
        )
        if response.is_error:
            raise StorageError(
                f"Deleting from {bucket} failed: {response.status_code} {response.text}"
            )


@cache
def storage() -> Storage:
    if not settings.supabase_url or not settings.supabase_secret_key:
        raise StorageError("SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env")
    return Storage(
        httpx.AsyncClient(
            base_url=f"{settings.supabase_url.rstrip('/')}/storage/v1",
            headers={
                "apikey": settings.supabase_secret_key,
                "authorization": f"Bearer {settings.supabase_secret_key}",
            },
            timeout=_TIMEOUT_SECONDS,
        )
    )
