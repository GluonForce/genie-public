"""The queue against the real dev database. Opt in with GENIE_DB_TESTS=1 (needs DATABASE_URL).

Each test creates its own rows with a dev-…@genie.test user and deletes them afterwards.
"""

import asyncio
import os
import uuid
from decimal import Decimal

import pytest

from genie_worker.db import Database, open_pool, run_async

pytestmark = pytest.mark.skipif(
    os.environ.get("GENIE_DB_TESTS") != "1", reason="set GENIE_DB_TESTS=1 to run against the dev DB"
)


async def with_approved_prototype(test):
    async with open_pool() as pool:
        email = f"dev-test-{uuid.uuid4().hex[:8]}@genie.test"
        async with pool.connection() as conn:
            cur = await conn.execute(
                "insert into users (email, email_normalized) values (%s, %s) returning id",
                (email, email),
            )
            user_id = (await cur.fetchone())["id"]
            cur = await conn.execute(
                """insert into prototypes (user_id, status, requirements)
                   values (%s, 'approved', %s::jsonb) returning id""",
                (
                    user_id,
                    '{"summary": "s", "intent": "i", "functional_requirements": [], '
                    '"user_stories": []}',
                ),
            )
            prototype_id = (await cur.fetchone())["id"]
        try:
            await test(pool, prototype_id)
        finally:
            async with pool.connection() as conn:
                await conn.execute("delete from events where user_id = %s", (user_id,))
                await conn.execute("delete from prototypes where id = %s", (prototype_id,))
                await conn.execute("delete from users where id = %s", (user_id,))


async def fetch(pool, sql, *params):
    async with pool.connection() as conn:
        cur = await conn.execute(sql, params)
        return await cur.fetchall()


def test_two_workers_never_claim_the_same_job() -> None:
    async def test(pool, prototype_id):
        workers = [Database(pool, f"test-worker-{n}") for n in range(2)]
        claims = await asyncio.gather(*(worker.claim() for worker in workers))
        ours = [c for c in claims if c is not None and c.prototype_id == str(prototype_id)]
        assert len(ours) == 1

        [row] = await fetch(
            pool, "select status, build_attempts, slug from prototypes where id = %s", prototype_id
        )
        assert row["status"] == "building" and row["build_attempts"] == 1
        # No title on the test row, so the slug falls back to "prototype-"
        assert row["slug"] == ours[0].slug and row["slug"].startswith("prototype-")

    run_async(with_approved_prototype(test))


def test_failure_then_requeue_lifecycle_writes_events() -> None:
    async def test(pool, prototype_id):
        worker = Database(pool, "test-worker-a")
        job = await worker.claim()
        assert job is not None and job.prototype_id == str(prototype_id)
        assert await worker.heartbeat(job)
        assert await Database(pool, "someone-else").heartbeat(job) is False

        assert await worker.finish_failure(
            job,
            error="boom",
            cost_usd=Decimal("0.0763"),
            source_path="sources/x.tar.gz",
            details={"attempt": 1},
        )
        # A second finish is refused: the job is no longer 'building'
        assert not await worker.finish_success(
            job, source_path="s", site_path="s", site_url="u", cost_usd=Decimal(0), details={}
        )

        [row] = await fetch(
            pool,
            "select status, build_cost_usd, source_path from prototypes where id = %s",
            prototype_id,
        )
        assert row["status"] == "build_failed"
        assert row["build_cost_usd"] == Decimal("0.0763")
        assert row["source_path"] == "sources/x.tar.gz"

        events = await fetch(
            pool,
            """select action, from_status, to_status, reason from events
               where prototype_id = %s order by id""",
            prototype_id,
        )
        assert [(e["action"], e["from_status"], e["to_status"]) for e in events] == [
            ("build_started", "approved", "building"),
            ("build_failed", "building", "build_failed"),
        ]
        assert events[1]["reason"] == "boom"

    run_async(with_approved_prototype(test))


async def release_past_expiry(pool, prototype_id) -> str:
    """Make the test prototype released with an expiry a minute ago; returns its slug.

    expire_due works on every due prototype, so this skips while real ones are due: the running
    worker should expire those, not a test with a fake KV.
    """

    due = await fetch(
        pool, "select 1 from prototypes where status = 'released' and expires_at <= now()"
    )
    if due:
        pytest.skip("real prototypes are due to expire")
    slug = f"dev-expiry-{uuid.uuid4().hex[:8]}"
    async with pool.connection() as conn:
        await conn.execute(
            """update prototypes set status = 'released', slug = %s,
               expires_at = now() - interval '1 minute' where id = %s""",
            (slug, prototype_id),
        )
    return slug


def test_expire_due_turns_off_released_prototypes_past_their_expiry() -> None:
    async def test(pool, prototype_id):
        slug = await release_past_expiry(pool, prototype_id)
        switched: list[tuple[str, str]] = []

        async def set_state(slug: str, state: str) -> None:
            switched.append((slug, state))

        assert await Database(pool, "test-worker").expire_due(set_state) == 1
        assert switched == [(slug, "expired")]
        [row] = await fetch(pool, "select status from prototypes where id = %s", prototype_id)
        assert row["status"] == "expired"
        [event] = await fetch(
            pool,
            "select from_status, to_status from events where prototype_id = %s and action = %s",
            prototype_id,
            "expired",
        )
        assert (event["from_status"], event["to_status"]) == ("released", "expired")
        # Nothing left to do on the next round
        assert await Database(pool, "test-worker").expire_due(set_state) == 0

    run_async(with_approved_prototype(test))


def test_expire_due_rolls_back_when_cloudflare_fails() -> None:
    async def test(pool, prototype_id):
        await release_past_expiry(pool, prototype_id)

        async def set_state(slug: str, state: str) -> None:
            raise RuntimeError("Cloudflare is down")

        with pytest.raises(RuntimeError):
            await Database(pool, "test-worker").expire_due(set_state)
        [row] = await fetch(pool, "select status from prototypes where id = %s", prototype_id)
        assert row["status"] == "released"

    run_async(with_approved_prototype(test))
