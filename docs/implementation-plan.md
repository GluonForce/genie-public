# Genie v2 — Implementation Plan (Phase 1)

Status: Draft v0.1 · 2026-11-10 · Owner: yehan@gluonforce.com

Builds what [requirements.md](requirements.md) asks for, on the stack in [architecture.md](architecture.md), with the screens in [design/](design/README.md). IDs such as FR-B3, BR-4 and AC-5 (acceptance criterion 5, requirements §7) refer to those documents.

---

## 0. Progress (read this first when picking up the work)

Last updated 2026-11-11.

| Task | Status | Notes |
|---|---|---|
| M0.1 Repo scaffold | Done | pnpm workspace, `apps/web`, `apps/worker` (uv, Python 3.13), CI for lint, typecheck, ruff, pytest. No Prettier yet. |
| M0.2 Migration | Done | `supabase/migrations/20261110000000_init.sql`, applied to the dev project. |
| M0.3 Email normalisation | Done, changed | `apps/web/lib/email.ts`: trim and lower-case only. Gmail dot/plus rules removed (owner's decision: same-looking addresses may be different people). No unit tests. |
| M0.4 Users in the database | Done, changed | No webhook. `ensureUser()` in `lib/users.ts` runs in the `/app` and `/admin` layouts: creates the `users` row + `signup` event on first visit; a returning email relinks its existing row (no "account exists" block). Tested by the owner. |
| M0.5 Access checks | Done | `lib/auth.ts`. Admins are sent from `/app` to `/admin`, so admins never see the user app. |
| M0.6 Design system | Done | `components/ui/`: Button (`md`/`sm`, variants primary, inverse, outline, danger), ButtonLink, Input, Textarea, Card (`user`/`admin`), Pill (`md`/`sm`, tones), Dialog (native `<dialog>`, 640px), ProgressTrack, Wave, Container. Button styles shared in `button-styles.ts`. All colour tokens in `globals.css`. Preview at `/dev/components` (dev only). Smaller pieces (tab buttons with counts, QA checklist bar) are built with the screens that use them. |
| M0.7 Landing and auth screens | Done | Clerk `<SignIn />` / `<SignUp />` styled in `lib/clerk-appearance.ts`. |
| M0.8 `/api/me` | Partly done | Sign-up IP is already stored by `ensureUser()`. The endpoint comes with M2. |
| Motion | Started | `motion` (v14, `motion/react`) added. `Wave` has an `animated` prop (`components/ui/animated-wave.tsx`): bars move while on screen, still under reduced motion. On for the Free plan wave and the footer wave; the Paid plan wave stays flat on purpose. |
| M1.1 Export spike | Done in effect | No separate spike: the ported agent with the new Static Export prompt section passed lint, `tsc` and `output: "export"` on every real run (habit-tracker test requirement, ~55 s agent time, ~$0.07–0.09 per build). |
| M1.2 E2B template | Done | `infra/e2b-template/`: `web/` is internal Genie's `templates/web` copied verbatim except `next.config.ts` (`output: "export"`, `trailingSlash`, `images.unoptimized`). `build.py` builds template `genie-web` (Node 22, pnpm 12 via corepack, `node_modules` baked in, 2 vCPU / 4 GB) with the E2B Python SDK. Cold start ~2 s; blank template builds in 15 s. |
| M1.3 Agent in the worker | Done | Internal Genie files copied into `apps/worker/src/genie_worker/` with minimal changes (see decisions): `agents/coding_agent.py`, `agents/context/web/code_generation.txt`, `core/openrouter.py`, `core/platforms.py` (WEB only), `models/requirements.py` (`RequirementsDraft` only). Tools go through the swappable `sandbox/` package. |
| M1.4 Job loop | Done | `db.py` (psycopg 3 pool, claim with `FOR UPDATE SKIP LOCKED`, heartbeat, finish, requeue, stale requeue after 40 min; every status change is a conditional update + `events` row) and `jobs.py` (poll every 5 s, one job at a time, heartbeat every 30 s, a shutdown mid-build requeues the job). Run with `uv run genie-worker`. |
| M1.5 Checks and fix round | Done | `build.py`: lint → `tsc --noEmit` → `pnpm build`, stopping at the first failure; on failure the errors go back to the same agent conversation once, then `build_failed`. Tested for real with an injected type error (fixed in 12 s). |
| M1.6 Outputs | Done | `artifacts.py` + `storage.py`: `sources/{id}.tar.gz`, `sites/{id}.tar.gz` (passed builds only) and `logs/{id}/{attempt}.jsonl` (outcome, checks, full agent conversation) in Supabase Storage; cost from OpenRouter's reported usage added to `build_cost_usd`. `slugs.py`: slug `{kebab-title}-{6 random}` assigned on the first claim (kept across rebuilds). `publish.py`: `out/` files to R2 `sites/{slug}/` (leftovers of an earlier build removed), KV `{slug}` = `preview`, `site_url` stored. |
| M1.7 Prototype host | Done (local) | `infra/proto-host/src/index.ts`, run with `pnpm --filter proto-host dev` (wrangler dev on port 8787, **remote** R2 and KV bindings, so it serves the real bucket). Slug from the host, KV state: `live` serves, `preview` needs a token (`?token=` once, then an HttpOnly cookie on that subdomain), `expired` → 410 page, `offline`/missing → 404 page. Path mapping for the trailing-slash export, `404.html` fallback, CSP `connect-src 'self'`, `noindex`, immutable cache for `_next/static`. Token = `{expiry}.{hex HMAC-SHA256(PREVIEW_TOKEN_SECRET, "{slug}.{expiry}")}`; secret in `.dev.vars` (gitignored). Dev helper: `node scripts/preview-token.mjs <slug> [minutes]`. All checks passed (tampered/expired/other-slug tokens refused, states switch within ~60 s). Deploying it waits for the domain (M5). |
| M1.8 Smoke check + admin email | Not started | Needs M1.7 and Resend. Until then a passed build goes straight to `awaiting_qa`. |
| M1.9 `enqueue` command | Done | `uv run genie-worker enqueue requirements.json` adds a `dev-…@genie.test` user and an `approved` prototype. |

**Test data kept for M3 (owner's decision):** prototypes in `awaiting_qa` with their events and Storage files: `0b7e875c-6b4d-410c-a001-9a1e1abaabf7` (user `dev-c5dd9ac2@genie.test`, built before slugs existed, so no slug or R2 site) and `946318ad-dfdc-4681-8943-c05bad5a1097` (user `dev-64316d34@genie.test`, slug `habit-tracker-0tb1te`, 40 files in R2, KV `preview`).

**Pinned (owner, 2026-11-11): the prototype domain.** `gluonforce.workers.dev` was considered as a stand-in and rejected: workers.dev gives the Worker one address with no wildcard subdomains, so prototypes would need path-based URLs, a per-prototype `basePath` (every prototype rebuilt at the switch) and one shared origin (no per-prototype `localStorage` isolation, NFR-5). Until a domain is bought, everything runs at `{slug}.localhost:8787`. Buy the domain (e.g. through Cloudflare Registrar) whenever links must work for other people, not only at M5; then going live is configuration only: wildcard route `*.<domain>/*`, `wrangler secret put PREVIEW_TOKEN_SECRET`, `wrangler deploy`, `PROTO_BASE_DOMAIN` in `wrangler.jsonc` and `apps/worker/.env`.

**Demo on 2026-11-13:** follow [demo-guide.md](demo-guide.md). Sample requirements in `apps/worker/examples/`.

**Uncommitted as of 2026-11-11:** all of the M1 work above (`apps/worker/`, `infra/e2b-template/`, `infra/proto-host/`, `workerd` in `pnpm-workspace.yaml`, docs). Before committing, in `apps/worker`: `uv run ruff check .`, `uv run ruff format --check .`, `uv run pytest` (28 tests; `GENIE_DB_TESTS=1` also runs the two tests against the dev database). On Windows set `PYTHONIOENCODING=utf-8` when running `infra/e2b-template/build.py`.

**Next session, pick one (the owner decides):**
1. **Finish M1:** the smoke check before `awaiting_qa` (M1.8; needs `PREVIEW_TOKEN_SECRET` in `apps/worker/.env` and a `SMOKE_CHECK=false` switch for runs without the host).
2. **M2 recorder screen**, starting with the `/app/record` layout from `Record.dc.html` using the shared components, before any audio code.
3. Optional Motion polish, offered but not yet approved: hero entrance, hero playhead, dialog fade and scale.

**Ways of working:** the owner builds alone and goes one small step at a time: each step is explained and approved before code is written.

**Decisions made during M0:**
- Sign-in is Google or a 6-digit email code, no passwords (Clerk dashboard settings).
- Admin role lives in Clerk `publicMetadata.role = "admin"`, read from the session token claim `metadata`.
- `cacheComponents` and partial prefetching are off in `next.config.ts`.
- One database URL: `DATABASE_URL` (transaction pooler, port 6543). `drizzle.config.ts` reuses it with port 5432 for `drizzle-kit pull`.
- `postgres` (postgres.js) is pinned to 3.x for drizzle-kit compatibility.
- No `sign_in` events: Clerk keeps sign-in history.
- Same IP across accounts is **flagged for admins, never auto-rejected** (offices share IPs). Built in M2.8.
- No Vitest yet (owner's choice); add it when there is logic worth testing.
- pnpm install scripts: `sharp`, `unrs-resolver` and `esbuild` are set to `false` under `allowBuilds` in `pnpm-workspace.yaml`. A new package with an install script makes `pnpm install` fail with `ERR_PNPM_IGNORED_BUILDS` until it is listed there.
- Local dev stores `::1` as the sign-up IP; real IPs appear once deployed.

**Decisions made during M1:**
- **The worker polls the database** for `approved` prototypes; nothing calls the worker when an admin approves. A "wake up" endpoint may be added later only as a nudge, never as the source of truth.
- **The sandbox is swappable.** The agent's tools talk to the `Sandbox` interface in `genie_worker/sandbox/base.py` (list, read, write, delete, pack, run, close). Only `sandbox/e2b.py` (and `infra/e2b-template/build.py`) import `e2b`; `SANDBOX_PROVIDER` picks the provider. Tests use a local-folder sandbox.
- **Reuse internal Genie as-is where possible.** The agent's tool names, arguments, docstrings, request limit (250), fallback model and command blocks are unchanged. Prompt changes: written for a member of the public instead of employees and clients, `generated/` → "the project directory", and a new **Static Export** section (no runtime dynamic routes, no server-only APIs, run `pnpm build` once at the end since it also type-checks).
- **Prompt caching is on** for the coding agent (`cache=True`): instructions, tools and the conversation are read from the provider's cache. Mainly saves on fix rounds, which resend the whole conversation.
- **A passed build goes to `awaiting_qa`** for now; the R2 preview and smoke check slot in before it in M1.8.
- **Crashes are not retried automatically.** Model, sandbox, storage or invalid-requirement errors end in `build_failed` with the error; failed checks get one fix round first. An admin can retry (M3.5).
- **QA rebuild note:** `build_note` is added to the agent's prompt as "an earlier build was rejected in review; avoid these defects", and cleared when a build passes.
- New event action `build_requeued` (system, `building → approved`) for stale or shut-down builds; add it to the architecture event catalogue.
- psycopg needs the selector event loop on Windows; `db.run_async()` handles it (Railway runs Linux).
- `wrangler dev` with remote bindings needs the account's workers.dev subdomain (registered: `gluonforce.workers.dev`). On Windows, stopping `wrangler dev` can leave `workerd.exe` running on port 8787; stop stray `workerd` processes before restarting, or requests reach the old instance.
- The pnpm script is `preview-link`, not `token` (`pnpm token` is a built-in pnpm command).
- The fix round, the build log and the cost all use pydantic-ai's run result: `RunUsage.cost` comes from OpenRouter, so no price table is kept.

**Schema changes:** add a SQL file to `supabase/migrations`, run `pnpm dlx supabase db push --remote`, then `pnpm --filter web db:pull` to regenerate `apps/web/lib/db/generated/`. Commit all of it.

---

## 1. Approach

Six milestones. Each ends with something that can be demonstrated and checked against the acceptance criteria.

| Milestone | Outcome | Proves | Rough effort* |
|---|---|---|---|
| **M0 Foundations** | Repo, database, sign-up, design system, landing page, guarded admin shell | AC-2 (quota by email) | 4–5 days |
| **M1 Builder in the cloud** | Requirements JSON in, preview URL out, with no UI | AC-8, AC-10 | 7–9 days |
| **M2 Capture** | Record, generate, change requests, approve or decline, status screens | AC-1, AC-2, AC-3 | 7–9 days |
| **M3 Admin** | Queue, review, decline, QA and release, record and event log | AC-4 to AC-7 | 5–7 days |
| **M4 Hardening** | Expiry, retention, emails, rate limits, monitoring, legal pages, load test | AC-9, NFRs | 4–6 days |
| **M5 Launch** | Production environment, domains, runbook, soft launch | Live product | 2–3 days |

\* One experienced full-stack developer, working days. These are planning estimates, not commitments; M1 carries the most uncertainty.

**Order:** M1 starts straight after M0 because it holds the biggest technical risk: whether the reused agent works through E2B and whether its output survives a static export. M2 and M3 are standard app work. With two developers, M1 (Python and infrastructure) and M2 (Next.js) run in parallel after M0, and M3 follows M2.

```
Dev A:  M0 ──► M1 builder ─────────────► M4 ──► M5
Dev B:  M0 ──► M2 capture ──► M3 admin ──┘
```

---

## 2. Implementation choices

These fill in details the architecture leaves open. Each is a default; change it before M0 starts if you prefer something else.

| Area | Choice | Reason |
|---|---|---|
| Repository | One Git repo, **pnpm workspaces** for `apps/web` and `infra/proto-host`; `apps/worker` is a separate **uv** Python project in the same repo | Matches architecture §11; no build orchestrator needed at this size. |
| Web app | Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS 4 with the design tokens, fonts through `next/font/google` (Unbounded, Onest) | Same major versions as the internal template, so the team knows them. |
| UI components | Small hand-built set (Button, Input, Card, Pill, Dialog, Wave, ProgressTrack, headers) following [design/](design/README.md) | The design is custom, so a full component kit would mostly be overridden. |
| Database access (web) | **Drizzle ORM + postgres.js** over the Supabase pooler, server-only | Status changes need a conditional `UPDATE` plus an `events` insert in one transaction (architecture §5.5); supabase-js cannot run multi-statement transactions. |
| Database access (worker) | psycopg 3 | Plain SQL for claim, heartbeat and status updates. |
| Migrations | Supabase CLI, SQL files in `supabase/migrations` | Single source of truth for both apps. Drizzle schema is generated from the database (`drizzle-kit pull`). |
| Validation | Zod on every route handler input and on the requirement agent output | |
| Requirement agent | Vercel AI SDK `generateObject` with the OpenRouter provider and the Zod `RequirementsDraft` schema (+ `title`) | Architecture §1. |
| Auth UI | Clerk with **Google or email code** (no password), Clerk's `<SignIn />` / `<SignUp />` styled through `appearance` and `localization` to match the design | Design screens 1 and 2. |
| Email | Resend + React Email templates in `apps/web/emails`, also called by the worker through a small internal API or the Resend API directly | |
| Object storage | Supabase Storage (audio, tarballs, logs); Cloudflare R2 through its S3 API (`boto3` in the worker) | Architecture §1. |
| Testing | Vitest (web unit, not set up yet), Playwright (web end-to-end, OpenRouter mocked), pytest (worker, with a fake sandbox) | See §6. |
| CI | GitHub Actions: lint, typecheck, unit tests on every push; Playwright on pull requests | |
| Error tracking | Sentry for web and worker | NFR-10. |

---

## 3. Before coding: accounts and decisions

Owner: you, unless noted. Items marked **(blocks M1)** must be done before M1 can finish.

- [x] Git hosting: https://github.com/GluonForce/genie-public.git (branch `main`).
- [ ] **Prototype domain (Q4)** registered and added to Cloudflare **(needed for M5 only)**. Until then the prototype host runs locally at `{slug}.localhost:8787` (see M1.7), and the domain is read from `PROTO_BASE_DOMAIN` everywhere, so adding it later is configuration only.
- [ ] Cloudflare account: R2 bucket, KV namespace, Workers enabled, API token.
- [x] Supabase project (dev), later a separate prod project.
- [x] Clerk application (dev instance), later prod. Settings: Google and email code sign-in, passwords off, block email subaddresses, block disposable domains, session token claim `{"metadata": "{{user.public_metadata}}"}`.
- [ ] E2B account and API key **(blocks M1)**.
- [ ] OpenRouter key with a monthly spend alert; confirm model ids for transcription, requirements and coding (same as internal `.env`).
- [ ] Railway project for the worker.
- [ ] Vercel project for the web app; DNS for `genie.gluonforce.com`.
- [ ] Resend account with the sending domain verified (SPF, DKIM) and a sender address.
- [ ] Sentry project.
- [ ] Copy for placeholders: `[PRICE]` (can stay "not set yet"), `[REVIEW AND BUILD TIME]`, `[CONTACT EMAIL]`, Terms, Privacy and Acceptable use pages.
- [ ] 10–20 past requirement sets from internal Genie, for the M1 export test (dev can pull these).

---

## 4. Milestones

Each task lists where the work lives and how we know it is done.

### M0 Foundations

| ID | Task | Where | Done when |
|---|---|---|---|
| M0.1 | Repo scaffold: pnpm workspace, `apps/web` (Next.js 16), `apps/worker` (uv), `infra/*`, ESLint, Prettier, Ruff, `.env.example` per app, GitHub Actions for lint and typecheck | root | CI is green on an empty app |
| M0.2 | Migration `0001`: enums, `users`, `prototypes`, `events`, indexes, RLS on with no policies; private Storage buckets `audio`, `sources`, `sites`, `logs` | `supabase/migrations` | `supabase db reset` builds the schema locally; anon key can read nothing |
| M0.3 | Email normalisation: trim and lower-case only. Unit tests deferred | `apps/web/lib/email.ts` | Letter-case variants map to one key |
| M0.4 | `ensureUser()` runs in the `/app` and `/admin` layouts: on the first visit after sign-up it creates or relinks the `users` row by normalised email, stores the sign-up IP and logs `signup`, all in one transaction. No webhook. Email changes and account deletion (`deleted_at`, clear `clerk_user_id`) still need a mechanism when those features arrive | `apps/web/lib/users.ts` | See rule below; `users` and `events` rows written |
| M0.5 | Access checks in layouts and route handlers, not in `proxy.ts` (Clerk and Next.js both advise against path-based checks there): `/app/**` needs a signed-in user; `/admin/**` and `/api/admin/**` need `metadata.role === "admin"`, otherwise 404. Helpers in `lib/auth.ts` | `apps/web/lib/auth.ts`, `app/app/layout.tsx`, `app/admin/layout.tsx` | A user gets 404 on `/admin`; an admin sees the shell |
| M0.6 | Design system: Tailwind theme tokens, fonts, components (Button, Input, Card, Pill, Dialog, Wave, ProgressTrack, AppHeader, AdminHeader, Footer) | `apps/web/components` | A `/dev/components` page (dev only) shows every component |
| M0.7 | Landing page, sign-up and verify-code screens wired to Clerk | `apps/web/app/(marketing)`, `app/(auth)` | Sign-up with a real email reaches `/app`; layout holds at 360px width |
| M0.8 | `GET /api/me`: returns account and prototype status. The sign-up IP (FR-A2) is already stored by `ensureUser()` from `x-forwarded-for` | `apps/web/app/api/me` | Returns the current status |

**Rule for duplicate emails (BR-1 to BR-3):** when a new Clerk user arrives, look up `users.email_normalized`.
- No row: create one.
- A row with `deleted_at` set (account deleted earlier): relink it to the new Clerk user, so the used quota comes back with it.
- An active row owned by another Clerk user: also relink it. Clerk never allows two accounts with the same email, so the old Clerk account must have been deleted (without a webhook we don't hear about deletions).

**Exit:** AC-2 passes for sign-up (delete-then-recreate ends up on the same quota).

### M1 Builder in the cloud

| ID | Task | Where | Done when |
|---|---|---|---|
| M1.1 | **Spike, first two days:** run the internal coding agent locally with the template switched to `output: "export"` and the extra prompt rules (architecture §7.1) on 10–20 past requirement sets | scratch branch | We know the export failure rate and the top causes; prompt rules adjusted |
| M1.2 | E2B template: Node 22, pnpm, the internal web template with `output: "export"`, `trailingSlash`, `images.unoptimized`, `node_modules` installed | `infra/e2b-template` | `e2b template build` succeeds; a sandbox starts in seconds and `pnpm build` passes on the blank template |
| M1.3 | Worker skeleton: copy `coding_agent.py`, `code_generation.txt`, `core/openrouter.py`, `core/config.py` from internal Genie; replace local file tools with an E2B adapter (list, read, write, edit, delete, run pnpm) keeping the same block lists and the 250-request limit | `apps/worker` | Unit tests pass against a fake sandbox |
| M1.4 | Job loop: claim with `FOR UPDATE SKIP LOCKED` (`approved` → `building`), heartbeat every 30 s, requeue jobs with a heartbeat older than 40 min, one job at a time; every status change writes an `events` row | `apps/worker/jobs.py` | Two worker processes never take the same job (test) |
| M1.5 | Checks inside the sandbox: `pnpm lint`, `tsc --noEmit`, `pnpm build`; on failure the errors go back to the agent for one more attempt, then `build_failed` | `apps/worker/build.py` | A deliberately broken build ends in `build_failed` with the log saved |
| M1.6 | Outputs: source (without `node_modules`, `.next`, `out`) and `out/` as `.tar.gz` in Storage; `out/` uploaded to R2 at `sites/{slug}/`; tokens and cost written to `build_cost_usd` and the `build_succeeded` event | `apps/worker/artifacts.py` | Files present; cost recorded |
| M1.7 | Prototype host Worker: slug from host, KV state (`preview`, `live`, `expired`, `offline`), HMAC preview token, path to `index.html` mapping, CSP and `noindex` headers, expired and unavailable pages | `infra/proto-host` | Under `wrangler dev`, `http://{slug}.localhost:8787` serves the site (browsers resolve any `*.localhost` to your machine); preview works with a token and gives 404 without; CSP blocks `fetch("https://example.com")`. Base domain comes from `PROTO_BASE_DOMAIN` |
| M1.8 | Smoke check of the preview URL, then `awaiting_qa` and an email to admins | worker | Status and email arrive |
| M1.9 | Developer command `uv run worker enqueue path/to/requirements.json` that inserts a test prototype in `approved` | worker CLI | One command produces a preview URL |

**Exit:** a requirements JSON becomes a working preview URL with no manual steps; AC-8 and AC-10 pass; build time and cost for 5 runs written down.

### M2 Capture

| ID | Task | Where | Done when |
|---|---|---|---|
| M2.1 | `/app` reads the prototype status and shows the right screen (record, requirements, status) | `app/(app)/app` | Each status lands on its screen |
| M2.2 | `POST /api/requests` (create or restart while `recording`), `POST …/audio-upload-url`, `DELETE …/recording` | API | Ownership and status checked in one conditional update |
| M2.3 | Recorder: microphone permission, AudioWorklet to 16 kHz mono PCM16, 30 s chunks uploaded as WAV during recording, timer, live wave, pause and resume, warning at 9:00, stop at 10:00, 15 s minimum | `components/recorder` | Works on Chrome, Edge, Firefox, Safari desktop and iOS Safari (NFR-11); closing the tab loses at most one chunk |
| M2.4 | Playback of the joined chunks, Record again (discards chunks) | recorder | Matches screen 4 |
| M2.5 | `POST …/generate`: lock the recording, transcribe chunks in parallel through OpenRouter, join in order, refuse too-short transcripts without using a change request (FR-G5), run the requirement agent; the response streams progress steps for the Generating screen | API + `lib/agents/requirements.ts` | Requirements shown within 60 s for a 10-minute recording (NFR-1) |
| M2.6 | Requirement agent port: prompt rewritten for one speaker describing their own idea, adds `title`; output checked with Zod; each version stored as an event | `lib/agents` | 5 sample recordings give sensible requirements (reviewed by you) |
| M2.7 | `POST …/revise` (change requests, at most 2, conditional on `revision_count < 2`) | API + screen 6 | Third attempt refused by UI and API (AC-1) |
| M2.8 | `POST …/submit`: lock, record IP, compute the IP flag from `events.ip`, set `pending_review`, send the "request received" email | API | AC-3: a second account on the same IP shows the flag |
| M2.9 | `POST …/user-decline` with the warning dialog and optional reason | API + screen 7 | Quota used; status screen shows "Declined by you" |
| M2.10 | Status screens: waiting for review, live (link, copy, time left), closed (team decline with reason, user decline, expired) | screens 8–10 | Each variant renders from real data |

**Exit:** AC-1, AC-2 and AC-3 pass end to end in the dev environment.

### M3 Admin

| ID | Task | Where | Done when |
|---|---|---|---|
| M3.1 | Queue: status tabs with counts, oldest first, search by email, title or slug, IP flag pill | `app/admin` | Matches screen A1 |
| M3.2 | Detail for `pending_review`: requirement versions from `events`, change requests, signed audio URL, transcript, user and IP matches, read-only notice | `app/admin/prototypes/[id]` | Matches A2; no edit control exists anywhere (BR-14) |
| M3.3 | Approve (→ `approved`, the worker picks it up) and Decline with category and required reason (user email sent) | API + A3 | AC-6 for decline at review |
| M3.4 | QA view for `awaiting_qa`: preview through `/api/admin/…/preview` (short-lived token), requirement checklist (kept in the browser only), Release (KV `live`, `expires_at` = now + 3 days, ready email), Rebuild with a note (→ `approved` with `build_note`), Decline | A4 | AC-4 and AC-5 |
| M3.5 | Record view: stats, event log with filter, build log and source downloads, Take offline and Restore, Retry for `build_failed` | A5 | AC-7 |
| M3.6 | Every admin action writes an `events` row with actor and role | all admin routes | Event log shows the full history (FR-AD8) |

**Exit:** AC-4 to AC-7 pass.

### M4 Hardening

| ID | Task | Done when |
|---|---|---|
| M4.1 | Expiry job in the worker every 15 min: `released` past `expires_at` → `expired`, KV `expired` | AC-9 (tested with a short expiry in dev) |
| M4.2 | Audio retention: delete audio and transcript 90 days after a request closes, keep requirements (NFR-8) | Job removes test files older than the cutoff |
| M4.3 | All emails as React Email templates: request received, ready, declined, admin "new request" and "ready for QA", admin "build failed" | Each email sent from dev and checked in Gmail and Outlook |
| M4.4 | Rate limits on user routes (per user and per IP) | Burst test returns 429 |
| M4.5 | Sentry in web and worker; structured logs; OpenRouter spend alert | A forced error shows in Sentry |
| M4.6 | Terms, Privacy, Acceptable use pages; consent checkbox before the first recording | Can't record without ticking it |
| M4.7 | Accessibility and browser pass: keyboard, focus visible, contrast, 360px width, iOS Safari recording | Checklist signed off |
| M4.8 | Load test: 20 queued builds through one worker | All finish or fail cleanly; average time and cost recorded |

### M5 Launch

| ID | Task |
|---|---|
| M5.1 | Production Supabase, Clerk, Vercel, Railway, E2B, R2 and KV set up from `.env.example`; secrets only in each platform's settings |
| M5.2 | DNS: `genie.gluonforce.com` to Vercel; prototype domain wildcard to the Worker; Resend domain verified |
| M5.3 | Set the two admins' Clerk role to `admin`; confirm the session token template reads `{{user.public_metadata}}`; set `authorizedParties: ["https://genie.gluonforce.com"]` in `clerkMiddleware`; create Google OAuth credentials for Clerk's production instance |
| M5.4 | Runbook in `docs/runbook.md`: retry a stuck build, take a prototype offline, rotate keys, restore from backup |
| M5.5 | Production smoke test with a real recording, then soft launch to a small invited group before going public |

---

## 5. Repository layout at the end of M0

```
Genie_v2/
  apps/
    web/
      app/(marketing)/        landing, legal pages
      app/(auth)/             sign-in, sign-up (Clerk)
      app/app/                user flow by status
      app/admin/              queue and prototype detail
      app/api/                route handlers (architecture §6)
      components/             design system
      emails/                 React Email templates
      lib/                    db (Drizzle), email normalisation, agents, auth helpers
    worker/
      genie_worker/           agent, sandbox adapter, jobs, build, artifacts, expiry
      contexts/               code_generation.txt and other prompts
      tests/
  infra/
    proto-host/               Cloudflare Worker (wrangler)
    e2b-template/             e2b.Dockerfile + export template
  supabase/migrations/
  docs/
```

---

## 6. Testing

| Level | What | Tool |
|---|---|---|
| Unit | Email normalisation, status transitions (allowed and refused), IP flag query, slug generation, HMAC token | Vitest, pytest |
| Database | Conditional updates under concurrent requests (double-click, two tabs), job claiming with two workers | Vitest against local Supabase, pytest |
| Agent | Requirement agent on 5 fixed transcripts (snapshot of structure, reviewed by a person); builder on 10–20 past requirement sets before each prompt change | scripts in `apps/worker/evals`, `apps/web/evals` |
| End to end | Sign-up → record (fake audio) → generate (mocked OpenRouter) → change request ×2 → submit → admin approve → fake build → release → status shows link | Playwright |
| Manual | Real microphone on each browser in NFR-11, real build in E2B, emails in real inboxes | checklist per milestone |

Every acceptance criterion (requirements §7) gets at least one automated or written manual test before launch.

---

## 7. Definition of done for a task

- Code merged with CI green; new logic has tests.
- Status changes go through the conditional update and write an `events` row.
- Every page, route handler and server action checks access itself with `requireUser()` or `requireAdmin()` from `lib/auth.ts`. Layout checks are only for the header and redirects, because layouts don't re-run on every navigation.
- No secret in the browser bundle, the sandbox or the repo.
- UI matches the design at desktop and 360px width; keyboard reachable.
- `.env.example` and docs updated if setup changed.

---

## 8. Open questions

| # | Question | Default if not answered |
|---|---|---|
| P1 | Who is building this, and is there a target launch date? | **Answered:** the owner builds it alone. No fixed date yet. |
| P2 | One repository or two (web app and worker)? | One repository (recommended), each app deployed from its own folder. |
| P3 | Prototype domain (Q4) | **Answered:** bought after the app is complete, before launch (M5). Development uses `{slug}.localhost`. |
| P4 | Is the duplicate-email rule in M0.4 right? | **Answered:** no Gmail dot/plus merging; a returning email always relinks to its existing row. |
