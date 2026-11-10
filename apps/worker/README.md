# genie-worker

Build worker for Genie v2. Claims approved prototypes from Postgres, runs the coding agent with its tools inside an E2B sandbox, and publishes the static build. See [architecture §7](../../docs/architecture.md).

```sh
uv sync
cp .env.example .env
uv run genie-worker
uv run pytest
uv run ruff check .
```
