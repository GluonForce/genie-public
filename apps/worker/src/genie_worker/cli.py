"""`genie-worker` runs the build loop; `genie-worker enqueue requirements.json` adds a test job."""

import argparse
import asyncio
import json
import logging
import os
import signal
import socket
import uuid
from pathlib import Path

from psycopg.types.json import Jsonb

from genie_worker.db import Database, open_pool, run_async
from genie_worker.jobs import run_worker
from genie_worker.models.requirements import RequirementsDraft
from genie_worker.sandbox import open_sandbox
from genie_worker.storage import storage


def main() -> None:
    parser = argparse.ArgumentParser(prog="genie-worker")
    commands = parser.add_subparsers(dest="command")
    commands.add_parser("run", help="poll for approved prototypes and build them (default)")
    enqueue_parser = commands.add_parser(
        "enqueue", help="development only: add a test user and an approved prototype"
    )
    enqueue_parser.add_argument("requirements", type=Path, help="RequirementsDraft JSON file")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    for noisy in ("httpx", "httpcore", "e2b", "psycopg.pool"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    if args.command == "enqueue":
        run_async(enqueue(args.requirements))
    else:
        run_async(run())


async def run() -> None:
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:
            pass  # Windows: Ctrl+C ends the process; a stale build is requeued by the next worker
    async with open_pool() as pool:
        queue = Database(pool, worker_id=f"{socket.gethostname()}-{os.getpid()}")
        await run_worker(queue, storage(), open_sandbox, stop)


async def enqueue(path: Path) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    RequirementsDraft.model_validate(data)
    email = f"dev-{uuid.uuid4().hex[:8]}@genie.test"
    async with open_pool() as pool, pool.connection() as conn, conn.transaction():
        cur = await conn.execute(
            "insert into users (email, email_normalized) values (%s, %s) returning id",
            (email, email),
        )
        user_id = (await cur.fetchone())["id"]
        cur = await conn.execute(
            """
            insert into prototypes (user_id, title, status, requirements, submitted_at)
            values (%s, %s, 'approved', %s, now())
            returning id
            """,
            (user_id, data.get("title"), Jsonb(data)),
        )
        prototype_id = (await cur.fetchone())["id"]
        await conn.execute(
            """
            insert into events (actor_role, user_id, prototype_id, action, to_status, details)
            values ('system', %s, %s, 'approved', 'approved', %s)
            """,
            (user_id, prototype_id, Jsonb({"dev_enqueue": True})),
        )
    print(f"Enqueued prototype {prototype_id} for test user {email}")
