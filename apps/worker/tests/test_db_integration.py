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
