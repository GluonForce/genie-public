# Genie v2 — Implementation Plan (Phase 1)

Status: Draft v0.1 · 2026-11-10 · Owner: yehan@gluonforce.com

Builds what [requirements.md](requirements.md) asks for, on the stack in [architecture.md](architecture.md), with the screens in [design/](design/README.md). IDs such as FR-B3, BR-4 and AC-5 (acceptance criterion 5, requirements §7) refer to those documents.

---

## 0. Progress (read this first when picking up the work)

Last updated 2026-11-12 (end of session).

| Task | Status | Notes |
|---|---|---|
| M0.1 Repo scaffold | Done | pnpm workspace, `apps/web`, `apps/worker` (uv, Python 3.13), CI for lint, typecheck, ruff, pytest. No Prettier yet. |
| M0.2 Migration | Done | `supabase/migrations/20261110000000_init.sql`, applied to the dev project. |
| M0.3 Email normalisation | Done, changed | `apps/web/lib/email.ts`: trim and lower-case only. Gmail dot/plus rules removed (owner's decision: same-looking addresses may be different people). No unit tests. |
| M0.4 Users in the database | Done, changed | No webhook. `ensureUser()` in `lib/users.ts` runs in the `/app` and `/admin` layouts: creates the `users` row + `signup` event on first visit; a returning email relinks its existing row (no "account exists" block). Tested by the owner. |
| M0.5 Access checks | Done | `lib/auth.ts`. Admins are sent from `/app` to `/admin`, so admins never see the user app. |
| M0.6 Design system | Done | `components/ui/`: Button (`md`/`sm`, variants primary, inverse, outline, danger), ButtonLink, Input, Textarea, Card (`user`/`admin`), Pill (`md`/`sm`, tones), Dialog (native `<dialog>`, 640px), ProgressTrack, Wave, Container. Button styles shared in `button-styles.ts`. All colour tokens in `globals.css`. Preview at `/dev/components` (dev only). Smaller pieces (tab buttons with counts, QA checklist bar) are built with the screens that use them. |
| M0.7 Landing and auth screens | Done | Clerk `<SignIn />` / `<SignUp />` styled in `lib/clerk-appearance.ts`. |
| M0.8 `/api/me` | Not needed so far | Sign-up IP is stored by `ensureUser()`. `/app` is a server component that reads the user and prototype directly, so no client needs `/api/me` yet. |
| Motion | Started | `motion` (v14, `motion/react`) added. `Wave` has an `animated` prop (`components/ui/animated-wave.tsx`): bars move while on screen, still under reduced motion. On for the Free plan wave and the footer wave; the Paid plan wave stays flat on purpose. |
| M3.4 (part) Admin QA screen | Done (demo subset) | `/admin` queue (design A1): tabs Ready for QA and Live with counts. `/admin/prototypes/[id]` (design A4): Open preview via `/api/admin/requests/[id]/preview` (15-minute token, opens in a new tab rather than an iframe because the preview cookie is third-party there), requirement checklist (browser only), Release (one transaction: `released`, `released_by/at`, `expires_at` +3 days, KV `live`, `released` event; rolls back if Cloudflare fails; no email yet), Rebuild with a note (→ `approved` + `build_note`, `rebuild_requested` event), build facts from events. `lib/prototype-host.ts`, `lib/format.ts`. `apps/web/.env.local` needs `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_KV_NAMESPACE_ID`, `PROTO_BASE_DOMAIN`, `PREVIEW_TOKEN_SECRET`. Clicked through by the owner 2026-11-12. Decline at QA and the other tabs were added in M3.1–M3.3. |
| M2.1–M2.2 Routing and request API | Done | `/app` shows the screen for the prototype's status (every status has its screen since M2.10). `POST /api/requests` (create, or restart while recording), `POST /api/requests/[id]/audio-upload-url`, `DELETE /api/requests/[id]/recording`; shared checks in `lib/requests.ts`. |
| M2.3–M2.4 Recorder | Done, tested by the owner | `public/worklets/pcm16-recorder.js` (16 kHz mono PCM16), `app/app/_components/use-recorder.ts`: 30 s WAV chunks uploaded through signed URLs (`lib/storage.ts`) while recording, wave follows the mic, pause, 9:00 warning, 10:00 stop, 15 s minimum. Review screen with playback and Record again. A recording saved in an earlier visit can still be generated from (no playback). |
| M2.5–M2.6 Generate | Done, tested by the owner | `POST /api/requests/[id]/generate` streams steps to the Generating screen: lock, transcribe chunks in parallel (`lib/agents/transcription.ts`), requirement agent (`lib/agents/requirements.ts`, prompt `requirement-prompt.ts` = internal prompt adapted for one speaker + `title`), `requirements_ready` + `requirements_generated` event. Under 25 words: refused, recording unlocked (FR-G5). A lock older than 3 min counts as dead. Plain `fetch` to OpenRouter, no AI SDK or Zod. Sample: ~7 s, ~$0.012 for requirements. |
| Cost breakdown | Done | Migration `20261113000000_request_costs.sql`: `transcription_cost_usd`, `requirements_cost_usd` next to `build_cost_usd` (all from OpenRouter's reported cost; verified against OpenRouter for builds). Applied with `supabase db push --db-url` (session pooler), schema regenerated with `db:pull`. Shown to admins as a Cost card (stage, model, cost, total) on every prototype page (`lib/costs.ts`); the queue's Cost column is the total. |
| M2.7–M2.9 Requirements screen | Built, owner to test | `requirements-screen.tsx` (design 6 and 7): version line, changes from the latest change request highlighted, user stories expandable. `POST …/revise` (internal Genie's revise prompt with all remarks so far; at most 2, optimistic check on `revision_count`; `requirements_revised` event with cost), `POST …/submit` (confirm dialog; `pending_review`, `submitted_at`, IP flag from `events.ip` including the submitting IP; `submitted` event with `ip_flag_matches`), `POST …/user-decline` (warning dialog, optional reason). Refused attempts log `blocked_attempt`. No emails yet (M4.3). |
| M2.10 Status screens | Built, owner to test | `status-screens.tsx`: in progress (waiting for review / being built / being checked, with the stage list), live (copy link, time left, offline date), closed (not accepted with reason, declined by you, expired, offline). A failed build shows as "being built" to the user. |
| M3.1–M3.3 Queue, review, decisions | Built, owner to test | Queue tabs: Pending approval (changes used, IP flag pill), Building, Ready for QA, Build failed, Live, Closed. Detail page by status: requirement versions with change requests (read only), Accept and start build, Decline dialog (category + reason the user sees; also on the QA page), Retry for failed builds, recording player (`/api/admin/requests/[id]/audio` joins the chunks) and transcript, user card with IP matches. Every decision writes an `events` row with the admin as actor (M3.6 for these actions). |
| M3.5 Record view + M3.1 search | Built, owner to test | Event log on every prototype page (`event-log.tsx`): all events plus the owner's sign-up, newest first, filter All / User / Admin / System in the URL (`?events=`), a plain-English line per event, "Open log" on build events. Live, offline and expired prototypes get the A5 header: Open prototype, Download source, Take offline (no reason, owner's decision) or Restore / Redeploy, and stats (expiry, attempts and rebuilds, build cost, link name). Restore keeps the original expiry while time is left; once the 3 days are over it redeploys for a fresh 3 days (owner's decision: `expired → released` allowed). Downloads: `GET /api/admin/requests/[id]/source` and `/logs/[attempt]` stream from Storage. Queue search box (email, title, link name) across every status. No separate "All prototypes" page (search covers it). |
| M1.1 Export spike | Done in effect | No separate spike: the ported agent with the new Static Export prompt section passed lint, `tsc` and `output: "export"` on every real run (habit-tracker test requirement, ~55 s agent time, ~$0.07–0.09 per build). |
| M1.2 E2B template | Done | `infra/e2b-template/`: `web/` is internal Genie's `templates/web` copied verbatim except `next.config.ts` (`output: "export"`, `trailingSlash`, `images.unoptimized`). `build.py` builds template `genie-web` (Node 22, pnpm 12 via corepack, `node_modules` baked in, 2 vCPU / 4 GB) with the E2B Python SDK. Cold start ~2 s; blank template builds in 15 s. |
| M1.3 Agent in the worker | Done | Internal Genie files copied into `apps/worker/src/genie_worker/` with minimal changes (see decisions): `agents/coding_agent.py`, `agents/context/web/code_generation.txt`, `core/openrouter.py`, `core/platforms.py` (WEB only), `models/requirements.py` (`RequirementsDraft` only). Tools go through the swappable `sandbox/` package. |
| M1.4 Job loop | Done | `db.py` (psycopg 3 pool, claim with `FOR UPDATE SKIP LOCKED`, heartbeat, finish, requeue, stale requeue after 40 min; every status change is a conditional update + `events` row) and `jobs.py` (poll every 5 s, one job at a time, heartbeat every 30 s, a shutdown mid-build requeues the job). Run with `uv run genie-worker`. |
| M1.5 Checks and fix round | Done | `build.py`: lint → `tsc --noEmit` → `pnpm build`, stopping at the first failure; on failure the errors go back to the same agent conversation once, then `build_failed`. Tested for real with an injected type error (fixed in 12 s). |
| M1.6 Outputs | Done | `artifacts.py` + `storage.py`: `sources/{id}.tar.gz`, `sites/{id}.tar.gz` (passed builds only) and `logs/{id}/{attempt}.jsonl` (outcome, checks, full agent conversation) in Supabase Storage; cost from OpenRouter's reported usage added to `build_cost_usd`. `slugs.py`: slug `{kebab-title}-{6 random}` assigned on the first claim (kept across rebuilds). `publish.py`: `out/` files to R2 `sites/{slug}/` (leftovers of an earlier build removed), KV `{slug}` = `preview`, `site_url` stored. |
| M1.7 Prototype host | Done (local) | `infra/proto-host/src/index.ts`, run with `pnpm --filter proto-host dev` (wrangler dev on port 8787, **remote** R2 and KV bindings, so it serves the real bucket). Slug from the host, KV state: `live` serves, `preview` needs a token (`?token=` once, then an HttpOnly cookie on that subdomain), `expired` → 410 page, `offline`/missing → 404 page. Path mapping for the trailing-slash export, `404.html` fallback, CSP `connect-src 'self'`, `noindex`, immutable cache for `_next/static`. Token = `{expiry}.{hex HMAC-SHA256(PREVIEW_TOKEN_SECRET, "{slug}.{expiry}")}`; secret in `.dev.vars` (gitignored). Dev helper: `node scripts/preview-token.mjs <slug> [minutes]`. All checks passed (tampered/expired/other-slug tokens refused, states switch within ~60 s). Deploying it waits for the domain (M5). |
| M1.8 Smoke check + admin email | Not started | Designed: the worker mints a 5-minute preview token, fetches `site_url`, needs 200 + HTML (retries ~90 s for KV delay), else `build_failed`. Needs `PREVIEW_TOKEN_SECRET` in the worker env and a `SMOKE_CHECK=false` switch (previews only resolve on the owner's machine until the domain exists). The admin "ready for QA" email waits for Resend (M4.3). Until then a passed build goes straight to `awaiting_qa`. |
| M1.9 `enqueue` command | Done | `uv run genie-worker enqueue requirements.json` adds a `dev-…@genie.test` user and an `approved` prototype. Samples in `apps/worker/examples/` (`habit-tracker.json`, `team-lunch-poll.json`). |
| M4.1 Expiry job | Built, owner to test | `Database.expire_due()` in `db.py`, called from the worker loop every minute between builds (`EXPIRY_CHECK_SECONDS`): each released prototype past `expires_at` gets KV `expired`, status `expired` and an `expired` event in one transaction; a Cloudflare error rolls back that one and is retried next minute without stopping builds. Every minute instead of every 15 (cheap query, links go off on time). Tests: worker keeps building when expiry fails; against the dev DB (`GENIE_DB_TESTS=1`), expiry and rollback (skipped while real prototypes are due). Railway picks it up on the next push to `yehan-dev`. |
| Worker on Railway | Done | `apps/worker/Dockerfile` (Python 3.13, uv 0.13.5, `uv sync --locked --no-dev`, non-root, runs `genie-worker` directly so SIGTERM requeues a running build), `.dockerignore`, `railway.json` (Dockerfile builder, 1 replica, restart on failure, watch `apps/worker/**`). Railway service: root directory `apps/worker`, branch `yehan-dev`, no public networking, variables = `apps/worker/.env`. The owner deployed it and built `team-lunch-poll-i081p9` through it. **Don't run a local worker at the same time**: both poll the same dev database. |

**Test data (2026-11-12):** the earlier test prototypes were deleted from the dev database by accident; their orphaned R2 files, KV keys and Storage files (`habit-tracker-0tb1te`, `team-lunch-poll-s62i2l`, ids `0b7e875c…`, `946318ad…`, `fa780c8e…`) were then removed. Remaining: `590fa86c-f463-4947-aaed-59fed5a0d6c1`, slug `team-lunch-poll-i081p9`. New test data: `uv run genie-worker enqueue examples/<file>.json` (built by the Railway worker).

**Pinned (owner, 2026-11-11): the prototype domain.** `gluonforce.workers.dev` was considered as a stand-in and rejected: workers.dev gives the Worker one address with no wildcard subdomains, so prototypes would need path-based URLs, a per-prototype `basePath` (every prototype rebuilt at the switch) and one shared origin (no per-prototype `localStorage` isolation, NFR-5). Until a domain is bought, everything runs at `{slug}.localhost:8787`. Buy the domain (e.g. through Cloudflare Registrar) whenever links must work for other people, not only at M5; then going live is configuration only: wildcard route `*.<domain>/*`, `wrangler secret put PREVIEW_TOKEN_SECRET`, `wrangler deploy`, `PROTO_BASE_DOMAIN` in `wrangler.jsonc` and `apps/worker/.env`.

**Demo:** postponed by the owner (2026-11-12) in favour of more development. [demo-guide.md](demo-guide.md) still describes the M1 flow. Sample requirements in `apps/worker/examples/`.

**Committed:** M1 is in `69b2c33` and the QA screen in `5d18e66` on `yehan-dev`. **Not committed yet:** everything from the session of 2026-11-12 below (M2, M3.1–M3.3, M3.5, M4.1, cost breakdown, migration `20261113000000_request_costs.sql`); web lint, typecheck and `pnpm build` pass. Before each commit, in `apps/worker`: `uv run ruff check .`, `uv run ruff format --check .`, `uv run pytest` (48 tests; `GENIE_DB_TESTS=1` also runs the four tests against the dev database); and `pnpm --filter proto-host typecheck`. On Windows set `PYTHONIOENCODING=utf-8` when running `infra/e2b-template/build.py`.

**Resolved 2026-11-12:** the preview link that "didn't work" was opened by clicking it in the terminal. Pasted into the Chrome address bar it works (token accepted, cookie set, prototype shown), and the bare address shows "not available" as intended. Always paste preview links into the address bar.

**To test (owner) before committing:**
1. As a user with "Water bottle information app" (`requirements_ready`; its transcription and requirement costs show $0 because it was generated before the cost columns): send a change request, then Approve.
2. As admin: `/admin` → Pending approval → Review → play the recording → Accept and start build. The Railway worker builds it (~90 s) → Ready for QA (needs `wrangler dev` for the preview) → Release.
3. As the user: `/app` shows the live screen with the link and time left.
4. Record view on a live prototype: event log and its filter, Open log, Download source, Take offline (the link shows "not available" within a minute) and Restore; queue search for "water".
5. Expiry and Redeploy (after the worker is redeployed on Railway): in the Supabase SQL editor run `update prototypes set expires_at = now() where slug = '<slug>'`. Within about a minute the record shows Expired, the link shows the expired page and the user sees "expired". Then Redeploy for 3 days on the record.
6. With a second account: record, generate, approve, then Decline it as admin with a category and reason; also try Decline on the requirements screen. Locally every account has IP `::1`, so a second account is always flagged.

**Next session, pick one (the owner decides):**
1. **M4.3 emails** through Resend (request received, declined, ready, admin notices).
2. **M1.8 smoke check.**
3. **M4.4 rate limits** on the user routes.

**Session 2026-11-12 (summary):** removed the orphaned files of the deleted test data → M2 in full: request API, AudioWorklet recorder with 30 s WAV chunks to Supabase Storage and a mic-driven wave, Generate (OpenRouter transcription per chunk in parallel, then the requirement agent, streamed steps), requirements screen with change requests, approve and decline, status screens → per-stage cost columns and the admin Cost card (model and cost for transcription, requirements and build) → M3.1–M3.3: all queue tabs, review page with recording and IP matches, Accept, Decline (review and QA), Retry → M3.5: event log, downloads, Take offline / Restore / Redeploy, queue search → M4.1: expiry job in the worker. Measured: requirements ~$0.012 and 6–8 s, a change request ~$0.013, a build $0.07–0.14 (OpenRouter's billed cost matches what we store).

**Session 2026-11-11 (summary):** built M1 almost completely. Worker settings and E2B check → E2B template `genie-web` → internal Genie coding agent ported into `apps/worker` behind a swappable sandbox (prompt adjusted for the public and static export) → checks with one fix round → prompt caching → tarballs and build log to Supabase Storage → job loop with database polling, heartbeats, requeue and events → slug, R2 upload and KV `preview` → Cloudflare prototype host (`infra/proto-host`) run locally with remote bindings → demo guide and sample requirements → Dockerfile and deployment to Railway. Accounts set up: E2B, Cloudflare (R2 bucket `genie-prototypes`, KV namespace, API token with KV edit, workers.dev subdomain `gluonforce`), Railway. Real builds: ~75–90 s and ~$0.07–0.09 each.

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

**Decisions made during M2 and M3:**
- **Audio is WAV, not MP3:** 16 kHz mono PCM16 from an AudioWorklet (`public/worklets/`, outside the Clerk matcher), cut into 30 s chunks uploaded during recording through signed Supabase Storage URLs (bucket `audio`, path `{prototype id}/{index}.wav`). Each chunk is transcribed separately, so no joining is needed before transcription; the admin player joins them on the server.
- **OpenRouter is called with plain `fetch`** (`lib/agents/openrouter.ts`), no AI SDK, no Zod. Models and fallbacks come from `TRANSCRIBING_AGENT`, `FALLBACK_TRANSCRIBING_AGENT`, `REQUIREMENT_AGENT`, `FALLBACK_REQUIREMENT_AGENT`, `REQUIREMENT_AGENT_EFFORT` in `apps/web/.env.local`.
- **The requirement prompt** is internal Genie's, rewritten for one person describing their own idea, with a 2–5 word `title`; the summary must describe the product, never "the speaker". Change requests reuse internal Genie's revise prompt with every remark so far.
- **Costs are stored per stage** (`transcription_cost_usd`, `requirements_cost_usd`, `build_cost_usd`), always from OpenRouter's reported `usage.cost`; the model per stage is read from the events.
- **Generate lock:** `recording_locked_at` is set while generating; a lock older than 3 minutes counts as dead so a crashed request can't block the user.
- **Refused actions** (second request, third change request, second submit) are logged as `blocked_attempt` events.
- Time maths for rendering (waiting, expires in) is done in SQL, because the React Compiler lint refuses `Date.now()` in components.

**Decisions made during M1:**
- **The worker polls the database** for `approved` prototypes; nothing calls the worker when an admin approves. A "wake up" endpoint may be added later only as a nudge, never as the source of truth.
- **The sandbox is swappable.** The agent's tools talk to the `Sandbox` interface in `genie_worker/sandbox/base.py` (list, read, write, delete, pack, run, close). Only `sandbox/e2b.py` (and `infra/e2b-template/build.py`) import `e2b`; `SANDBOX_PROVIDER` picks the provider. Tests use a local-folder sandbox.
- **Reuse internal Genie as-is where possible.** The agent's tool names, arguments, docstrings, request limit (250), fallback model and command blocks are unchanged. Prompt changes: written for a member of the public instead of employees and clients, `generated/` → "the project directory", and a new **Static Export** section (no runtime dynamic routes, no server-only APIs, run `pnpm build` once at the end since it also type-checks).
- **Prompt caching is on** for the coding agent (`cache=True`): instructions, tools and the conversation are read from the provider's cache. Mainly saves on fix rounds, which resend the whole conversation.
- **A passed build goes to `awaiting_qa`** for now; the R2 preview and smoke check slot in before it in M1.8.
- **Crashes are not retried automatically.** Model, sandbox, storage or invalid-requirement errors end in `build_failed` with the error; failed checks get one fix round first. An admin can retry from the prototype page (built with M3.3).
- **QA rebuild note:** `build_note` is added to the agent's prompt as "an earlier build was rejected in review; avoid these defects", and cleared when a build passes.
- New event action `build_requeued` (system, `building → approved`) for stale or shut-down builds; add it to the architecture event catalogue.
- psycopg needs the selector event loop on Windows; `db.run_async()` handles it (Railway runs Linux).
- `wrangler dev` with remote bindings needs the account's workers.dev subdomain (registered: `gluonforce.workers.dev`). On Windows, stopping `wrangler dev` can leave `workerd.exe` running on port 8787; stop stray `workerd` processes before restarting, or requests reach the old instance.
- The pnpm script is `preview-link`, not `token` (`pnpm token` is a built-in pnpm command).
- The fix round, the build log and the cost all use pydantic-ai's run result: `RunUsage.cost` comes from OpenRouter, so no price table is kept.

**Schema changes:** add a SQL file to `supabase/migrations`, run `pnpm dlx supabase db push --db-url <session pooler URL, port 5432> --yes`, then `pnpm --filter web db:pull` to regenerate `apps/web/lib/db/generated/`. Commit all of it.

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
- [x] Cloudflare account: R2 bucket `genie-prototypes`, KV namespace `74b12cdd…`, API token (R2 + Workers KV edit), workers.dev subdomain `gluonforce`. Wrangler logged in on the owner's machine.
- [x] Supabase project (dev), later a separate prod project.
- [x] Clerk application (dev instance), later prod. Settings: Google and email code sign-in, passwords off, block email subaddresses, block disposable domains, session token claim `{"metadata": "{{user.public_metadata}}"}`.
- [x] E2B account and API key.
- [ ] OpenRouter key with a monthly spend alert; confirm model ids for transcription, requirements and coding (same as internal `.env`). **Partly:** key in use by the worker; coding model confirmed (`anthropic/claude-sonnet-5.5`, fallback `deepseek/deepseek-v4-flash`). Spend alert and the transcription and requirement models still to confirm (M2).
- [x] Railway project for the worker (deployed from `yehan-dev`).
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
| M4.1 | Expiry job in the worker every minute (planned as 15 min): `released` past `expires_at` → `expired`, KV `expired` | AC-9 (tested with a short expiry in dev) |
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
