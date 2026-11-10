# Genie v2

Speech to prototype for the public: a user describes a web app out loud, Genie writes requirements, an admin approves, and a builder agent generates and hosts a Next.js prototype.

| Folder | What |
|---|---|
| `apps/web` | Next.js app: landing page, user flow, admin panel, API routes |
| `apps/worker` | Python build worker (coding agent in E2B) |
| `infra/` | Cloudflare prototype host and E2B template (added in M1) |
| `supabase/migrations` | Database schema (added in M0.2) |
| `docs/` | [Requirements](docs/requirements.md), [architecture](docs/architecture.md), [design](docs/design/README.md), [implementation plan](docs/implementation-plan.md) |

## Local setup

Requires Node 22+, pnpm 12 and uv.

```sh
pnpm install
cp apps/web/.env.example apps/web/.env.local
pnpm dev                      # http://localhost:3000

cd apps/worker
uv sync
cp .env.example .env
uv run genie-worker
```

Checks: `pnpm lint`, `pnpm typecheck`, and in `apps/worker`: `uv run ruff check .`, `uv run pytest`.
