"""The build queue in Postgres: prototypes with status 'approved' (architecture 7.2).

Every status change is a conditional update plus an events row in the same transaction.
"""

import asyncio
import sys
from collections.abc import Coroutine
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from psycopg import errors
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool

from genie_worker.core.config import settings
from genie_worker.slugs import make_slug

# A build whose heartbeat is older than this is assumed dead and goes back to the queue
STALE_AFTER = "40 minutes"
_SLUG_ATTEMPTS = 5


@dataclass(frozen=True)
class Job:
    prototype_id: str
    user_id: str
    requirements: dict[str, Any]
    attempt: int
    build_note: str | None
    # Subdomain of the preview and live site; set on the first claim, kept across rebuilds
    slug: str


class Database:
    def __init__(self, pool: AsyncConnectionPool, worker_id: str) -> None:
        self._pool = pool
        self.worker_id = worker_id

    async def claim(self) -> Job | None:
        """Take the oldest approved prototype; SKIP LOCKED keeps two workers off the same one."""

        async with self._pool.connection() as conn, conn.transaction():
            cur = await conn.execute(
                """
                with next as (
                  select id from prototypes
                  where status = 'approved'
                  order by status_changed_at
                  limit 1
                  for update skip locked
                )
                update prototypes p
                set status = 'building', status_changed_at = now(),
                    build_attempts = p.build_attempts + 1,
                    build_claimed_by = %s, build_heartbeat_at = now()
                from next
                where p.id = next.id
                returning p.id, p.user_id, p.requirements, p.build_attempts, p.build_note,
                          p.slug, p.title
                """,
                (self.worker_id,),
            )
            row = await cur.fetchone()
            if row is None:
                return None
            requirements = row["requirements"] or {}
            slug = row["slug"] or await _assign_slug(
                conn, row["id"], row["title"] or requirements.get("title")
            )
            job = Job(
                prototype_id=str(row["id"]),
                user_id=str(row["user_id"]),
                requirements=requirements,
                attempt=row["build_attempts"],
                build_note=row["build_note"],
                slug=slug,
            )
            await _event(
                conn,
                job,
                "build_started",
                "approved",
                "building",
                details={"attempt": job.attempt, "worker": self.worker_id},
            )
        return job

    async def heartbeat(self, job: Job) -> bool:
        """False if the job is no longer ours (it was requeued meanwhile)."""

        async with self._pool.connection() as conn:
            cur = await conn.execute(
                """
                update prototypes set build_heartbeat_at = now()
                where id = %s and status = 'building' and build_claimed_by = %s
                """,
                (job.prototype_id, self.worker_id),
            )
            return cur.rowcount == 1

    async def finish_success(
        self,
        job: Job,
        *,
        source_path: str,
        site_path: str,
        site_url: str,
        cost_usd: Decimal,
        details: dict[str, Any],
    ) -> bool:
        async with self._pool.connection() as conn, conn.transaction():
            cur = await conn.execute(
                """
                update prototypes
                set status = 'awaiting_qa', status_changed_at = now(),
                    source_path = %s, site_path = %s, site_url = %s,
                    build_cost_usd = build_cost_usd + %s, build_note = null,
                    build_claimed_by = null, build_heartbeat_at = null
                where id = %s and status = 'building' and build_claimed_by = %s
                """,
                (source_path, site_path, site_url, cost_usd, job.prototype_id, self.worker_id),
            )
            if cur.rowcount != 1:
                return False
            await _event(conn, job, "build_succeeded", details=details)
            await _event(
                conn, job, "qa_ready", "building", "awaiting_qa", details={"site_url": site_url}
            )
        return True

    async def finish_failure(
        self,
        job: Job,
        *,
        error: str,
        cost_usd: Decimal,
        source_path: str | None,
        details: dict[str, Any],
    ) -> bool:
        async with self._pool.connection() as conn, conn.transaction():
            cur = await conn.execute(
                """
                update prototypes
                set status = 'build_failed', status_changed_at = now(),
                    source_path = coalesce(%s, source_path),
                    build_cost_usd = build_cost_usd + %s,
                    build_claimed_by = null, build_heartbeat_at = null
                where id = %s and status = 'building' and build_claimed_by = %s
                """,
                (source_path, cost_usd, job.prototype_id, self.worker_id),
            )
            if cur.rowcount != 1:
                return False
            await _event(
                conn,
                job,
                "build_failed",
                "building",
                "build_failed",
                reason=error,
                details={**details, "error": error},
            )
        return True

    async def requeue(self, job: Job, reason: str) -> bool:
        """Put our own job back in the queue, e.g. when the worker is shutting down."""

        async with self._pool.connection() as conn, conn.transaction():
            cur = await conn.execute(
                """
                update prototypes
                set status = 'approved', status_changed_at = now(),
                    build_claimed_by = null, build_heartbeat_at = null
                where id = %s and status = 'building' and build_claimed_by = %s
                """,
                (job.prototype_id, self.worker_id),
            )
            if cur.rowcount != 1:
                return False
            await _event(conn, job, "build_requeued", "building", "approved", reason=reason)
        return True

    async def requeue_stale(self) -> int:
        """Put builds whose worker stopped sending heartbeats back in the queue."""

        async with self._pool.connection() as conn, conn.transaction():
            cur = await conn.execute(
                f"""
                with stale as (
                  select id from prototypes
                  where status = 'building'
                    and build_heartbeat_at < now() - interval '{STALE_AFTER}'
                  for update skip locked
                )
                update prototypes p
                set status = 'approved', status_changed_at = now(),
                    build_claimed_by = null, build_heartbeat_at = null
                from stale
                where p.id = stale.id
                returning p.id, p.user_id, p.build_attempts, p.slug
                """
            )
            rows = await cur.fetchall()
            for row in rows:
                job = Job(
                    str(row["id"]),
                    str(row["user_id"]),
                    {},
                    row["build_attempts"],
                    None,
                    row["slug"],
                )
                await _event(
                    conn,
                    job,
                    "build_requeued",
                    "building",
                    "approved",
                    reason=f"no heartbeat for {STALE_AFTER}",
                )
        return len(rows)


async def _assign_slug(conn: Any, prototype_id: Any, title: str | None) -> str:
    """Give the prototype a unique slug; the savepoint lets a rare collision retry."""

    for _ in range(_SLUG_ATTEMPTS):
        slug = make_slug(title)
        try:
            async with conn.transaction():
                await conn.execute(
                    "update prototypes set slug = %s where id = %s", (slug, prototype_id)
                )
        except errors.UniqueViolation:
            continue
        return slug
    raise RuntimeError(f"Could not find a free slug for {title!r}")


async def _event(
    conn: Any,
    job: Job,
    action: str,
    from_status: str | None = None,
    to_status: str | None = None,
    *,
    reason: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    await conn.execute(
        """
        insert into events
          (actor_role, user_id, prototype_id, action, from_status, to_status, reason, details)
        values ('system', %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            job.user_id,
            job.prototype_id,
            action,
            from_status,
            to_status,
            reason,
            Jsonb(details) if details is not None else None,
        ),
    )


def open_pool() -> AsyncConnectionPool:
    """A small pool; prepared statements are off because DATABASE_URL is Supabase's transaction
    pooler."""

    if not settings.database_url:
        raise RuntimeError("DATABASE_URL must be set in .env")
    return AsyncConnectionPool(
        settings.database_url,
        min_size=1,
        max_size=3,
        kwargs={"prepare_threshold": None, "row_factory": dict_row},
        open=False,
    )


def run_async[T](coroutine: Coroutine[Any, Any, T]) -> T:
    """asyncio.run with the selector event loop psycopg needs on Windows (Railway is Linux)."""

    if sys.platform == "win32":
        return asyncio.run(coroutine, loop_factory=asyncio.SelectorEventLoop)
    return asyncio.run(coroutine)
