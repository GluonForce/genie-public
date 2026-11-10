# Genie v2 — Implementation Plan (Phase 1)

Status: Draft v0.1 · 2026-11-10 · Owner: yehan@gluonforce.com

Builds what [requirements.md](requirements.md) asks for, on the stack in [architecture.md](architecture.md), with the screens in [design/](design/README.md). IDs such as FR-B3, BR-4 and AC-5 (acceptance criterion 5, requirements §7) refer to those documents.

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
| Auth UI | Clerk with **email code only** (no password), custom screens built on Clerk's `useSignUp` / `useSignIn` hooks to match the design | Design screens 1 and 2. |
| Email | Resend + React Email templates in `apps/web/emails`, also called by the worker through a small internal API or the Resend API directly | |
| Object storage | Supabase Storage (audio, tarballs, logs); Cloudflare R2 through its S3 API (`boto3` in the worker) | Architecture §1. |
| Testing | Vitest (web unit), Playwright (web end-to-end, OpenRouter mocked), pytest (worker, with a fake sandbox) | See §6. |
| CI | GitHub Actions: lint, typecheck, unit tests on every push; Playwright on pull requests | |
| Error tracking | Sentry for web and worker | NFR-10. |

---

## 3. Before coding: accounts and decisions

Owner: you, unless noted. Items marked **(blocks M1)** must be done before M1 can finish.

- [ ] Git hosting: create the GitHub repository (or confirm where the code lives).
- [ ] **Prototype domain (Q4)** registered and added to Cloudflare **(needed for M5 only)**. Until then the prototype host runs locally at `{slug}.localhost:8787` (see M1.7), and the domain is read from `PROTO_BASE_DOMAIN` everywhere, so adding it later is configuration only.
- [ ] Cloudflare account: R2 bucket, KV namespace, Workers enabled, API token.
- [ ] Supabase project (dev), later a separate prod project.
- [ ] Clerk application (dev instance), later prod. Settings: email code sign-in, passwords off, block email subaddresses, block disposable domains, session token claim `{"metadata": "{{user.public_metadata}}"}`.
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
| M0.3 | Email normalisation (lower-case; Gmail/Googlemail dots and `+tag` removed) with unit tests | `apps/web/lib/email.ts` | Tests cover Gmail variants, other domains, upper case |
| M0.4 | Clerk webhook `/api/webhooks/clerk` (verified with Svix): `user.created` creates or relinks the `users` row by normalised email and logs `signup`; `user.updated` syncs email and role copy (`role_changed`); `user.deleted` sets `deleted_at` and clears `clerk_user_id` | `apps/web/app/api/webhooks/clerk` | See rule below; events rows written |
| M0.5 | Clerk middleware: `/app/**` needs a signed-in user; `/admin/**` and `/api/admin/**` need `metadata.role === "admin"`, otherwise 404 | `apps/web/middleware.ts` | A user gets 404 on `/admin`; an admin sees the shell |
| M0.6 | Design system: Tailwind theme tokens, fonts, components (Button, Input, Card, Pill, Dialog, Wave, ProgressTrack, AppHeader, AdminHeader, Footer) | `apps/web/components` | A `/dev/components` page (dev only) shows every component |
| M0.7 | Landing page, sign-up and verify-code screens wired to Clerk | `apps/web/app/(marketing)`, `app/(auth)` | Sign-up with a real email reaches `/app`; layout holds at 360px width |
| M0.8 | `GET /api/me`: returns account and prototype status; records sign-up IP on first call (FR-A2) | `apps/web/app/api/me` | IP stored once, from `x-forwarded-for` |

**Rule for duplicate emails (BR-1 to BR-3):** when a new Clerk user arrives, look up `users.email_normalized`.
- No row: create one.
- A row with `deleted_at` set (account deleted earlier): relink it to the new Clerk user, so the used quota comes back with it.
- An active row owned by another Clerk user (for example `j.doe@gmail.com` and `jdoe@gmail.com`): delete the new Clerk user through the Clerk API and show "An account already exists for this email address".

**Exit:** AC-2 passes for sign-up (Gmail variants and delete-then-recreate both end up on the same quota).

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
| M5.3 | Set the two admins' Clerk role to `admin` |
| M5.4 | Runbook in `docs/runbook.md`: retry a stuck build, take a prototype offline, rotate keys, restore from backup |
| M5.5 | Production smoke test with a real recording, then soft launch to a small invited group before going public |

---

## 5. Repository layout at the end of M0

```
Genie_v2/
  apps/
    web/
      app/(marketing)/        landing, legal pages
      app/(auth)/             sign-up, verify
      app/(app)/app/          user flow by status
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
| P4 | Is the duplicate-email rule in M0.4 (refuse a second account for the same normalised email) right? | Yes, as written. |
