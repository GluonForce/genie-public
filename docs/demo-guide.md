# Genie v2 — Builder demo guide

For the demo on Friday 2026-11-13. Shows the build pipeline (milestone M1): an approved requirement becomes a working prototype, stored in Supabase and Cloudflare R2, and opened through the prototype host with an admin preview link.

What the demo is **not** yet: there is no recording screen (M2) and no requirements review in the admin panel (M3). A requirement is "approved" with a command instead. The admin QA screen (queue, Open preview, Release, Rebuild) is real.

---

## 1. What happens (talking points)

```
requirement approved ──► worker polls Postgres, claims it (status: building)
                          │
                          ├─ starts an E2B sandbox from the genie-web template (Next.js, deps installed)
                          ├─ coding agent writes the app (internal Genie agent, same rules)
                          ├─ worker checks it: lint → type check → static build (one fix round if needed)
                          ├─ Supabase Storage: source.tar.gz, site.tar.gz, build log
                          ├─ Cloudflare R2: the site's files under sites/{slug}/
                          ├─ Cloudflare KV: {slug} = preview (admins only)
                          ▼
                       status: awaiting_qa  ──► admin opens the preview link
                                              ──► Release: KV = live, anyone with the link can open it
```

- One build takes about **75–90 seconds** and costs about **$0.07–0.09** in model usage.
- Every step is recorded in the `events` table: who, what, when.
- Prototypes are frontend only (data in the browser's localStorage) and served as static files. A security header blocks any call to other websites.
- Each prototype gets its own subdomain (`{slug}.<domain>`), e.g. `team-lunch-poll-i081p9`. Until the domain is bought this is `{slug}.localhost:8787`, so **links only work on this computer**.

---

## 2. Before the demo (once, about 10 minutes)

1. **Env files are filled in:** `apps/worker/.env` (OpenRouter, E2B, Supabase, Cloudflare) and `infra/proto-host/.dev.vars` (`PREVIEW_TOKEN_SECRET`).
2. **Wrangler is signed in:** run `npx wrangler whoami` in `infra/proto-host`; it should show your account. If not, run `npx wrangler login`.
3. **Nothing else is using port 8787** (a leftover host from earlier). In PowerShell:
   ```powershell
   Get-Process workerd -ErrorAction SilentlyContinue | Stop-Process -Force
   ```
4. **Do one full dry run** of section 3 the day before, so E2B, OpenRouter and Cloudflare are all known to work.

Use **Chrome, Edge or Firefox** (they send any `*.localhost` address to this computer).

---

## 3. Running the demo

Open **three terminals** in `C:\Users\Administrator\Desktop\Genie_v2`.

### Terminal 1 — start the prototype host

```bash
cd infra/proto-host
pnpm exec wrangler dev
```

Wait for `Ready on http://127.0.0.1:8787`. Leave it running.

### Terminal 2 — the worker

**If the worker is deployed on Railway** (the plan for the demo): don't start it locally. Open the Railway service's **Deployments → Logs** instead; that is where the lines below appear. Two workers on the same database compete for jobs, so a local one would make the demo confusing.

**If it is not on Railway**, start it locally:

```bash
cd apps/worker
uv run genie-worker
```

Either way it prints `Worker started; polling for approved prototypes every 5.0s`. This is the backend.

### Terminal 3 — approve a requirement

```bash
cd apps/worker
uv run genie-worker enqueue examples/team-lunch-poll.json
```

This adds a test user and a prototype already in `approved`, standing in for "the admin pressed Approve". Show the JSON first: it is the same format the requirement agent produces (`summary`, `intent`, `functional_requirements`, `user_stories`, `title`).

Other samples: `examples/habit-tracker.json`, or write your own in the same shape.

### Watch the worker log (Railway logs, or terminal 2)

Within 5 seconds:

```
Building prototype 946318ad-… (attempt 1)
Coding (generating web) agent starting: model=…
Coding agent ran pnpm build: exited with code 0
Check lint: exit 0 · Check typecheck: exit 0 · Check build: exit 0
Published 40 files to sites/team-lunch-poll-x7k2qa/
Prototype 946318ad-… ready for QA
```

**Note the slug** from the `Published … to sites/<slug>/` line.

### Open the preview in the admin screen (recommended)

With the web app running (`pnpm dev` in `apps/web`, a fourth terminal) and signed in as an admin:

1. Open `http://localhost:3000/admin`. The new prototype is under **Ready for QA** (the queue shows how long it has waited and what it cost).
2. Click **Open QA**. The page shows the requirements as a checklist, the build facts (attempt, checks, build time, cost, model) and the decisions.
3. Click **Open preview**: a new tab opens the prototype with a 15-minute admin link. Tick off the requirements as you click through.
4. Click **Release**. The prototype moves to the **Live** tab and opens for anyone with the link (KV switches to `live`; allow up to a minute). Or type a defect into **Something is broken?** and click **Rebuild with this note**: the Railway worker rebuilds it with the note, and it comes back to Ready for QA.

### Open the preview from the command line (fallback)

```bash
cd ../../infra/proto-host
node scripts/preview-token.mjs <slug> 120
```

**Copy the printed link and paste it into the browser's address bar** (clicking it in the terminal may not open it correctly). The prototype loads, and the address bar changes to `http://<slug>.localhost:8787/` (the token became a cookie).

**Show the protection:** open `http://<slug>.localhost:8787/` in a private window: "This prototype is not available". Only admins with a link can see a build before release.

### Optional — release it

What the admin's **Release** button will do in M3:

```bash
pnpm exec wrangler kv key put <slug> live --namespace-id 74b12cdd0ee447969de5a1bc281939c3 --remote
```

Within about a minute the private window shows the prototype without a token. Set it back with `preview` instead of `live`; `expired` shows the "This prototype has expired" page.

---

## 4. Where to show the stored results

| What | Where |
|---|---|
| The prototype row (status `awaiting_qa`, slug, site URL, cost) | Supabase → Table editor → `prototypes` |
| The timeline (`approved`, `build_started`, `build_succeeded`, `qa_ready`) | Supabase → `events`, filter by `prototype_id` |
| Source and site tarballs | Supabase → Storage → `sources`, `sites` (file `<prototype id>.tar.gz`) |
| Full build log (every agent step, checks, tokens, cost) | Supabase → Storage → `logs/<prototype id>/1.jsonl` |
| The published files | Cloudflare → R2 → `genie-prototypes` → `sites/<slug>/` |
| The state | Cloudflare → Workers KV → namespace → key `<slug>` |

Right now only one prototype is in the database: `team-lunch-poll-i081p9` (Ready for QA). Run `enqueue` for more.

---

## 5. If something goes wrong

| Symptom | Fix |
|---|---|
| Preview link shows "not available" | Paste the link into the address bar instead of clicking it in the terminal. Otherwise the token expired (make a new one), or it was made for a different slug: check the slug in the worker log. |
| Requests to `*.localhost:8787` hang or return 500 | An old host is still running. Stop terminal 1, run the `Stop-Process` line from section 2, start terminal 1 again. |
| `wrangler dev` fails with "register a workers.dev subdomain" | Done already (`gluonforce.workers.dev`); if it reappears, run `npx wrangler login` again. |
| KV change (live, expired) not visible yet | KV takes up to about 60 seconds to update everywhere. Wait and refresh. |
| Worker logs `failed at build` or `crashed` | The row is `build_failed` with the reason in `events`; the full log is in `logs/`. Enqueue again to retry. |
| Garbled characters or a crash about encoding on Windows | Run `$env:PYTHONIOENCODING = "utf-8"` (PowerShell) before the worker. |
| Stopping the worker | `Ctrl+C`. A build stopped halfway goes back to the queue on the next start (after its heartbeat goes stale). |

---

## 6. Questions you may get

- **Can the user see the prototype straight away?** No. A person reviews the requirements first, and an admin checks the built prototype before releasing it (BR-9, BR-11). Only then is the link emailed.
- **How long does a link stay up?** 3 days after release, then it shows an "expired" page. The files are kept, so it can be brought back later without rebuilding.
- **Is the generated code safe to run?** It is built inside an isolated E2B sandbox with no secrets, served as static files only, and blocked from calling other websites.
- **Can it do mobile apps?** Not in Phase 1; web only.
- **Why not online yet?** The prototype domain hasn't been bought. Once it is, going live is configuration only (no code changes).
