# Genie v2 — Requirements Plan (Phase 1)

> Speech-to-prototype, shipped to the public. A user describes the web app they want by voice; Genie turns it into requirements, an admin approves it, and a builder agent generates and deploys a Next.js prototype.

Status: Draft v0.1 · 2026-11-09 · Owner: yehan@gluonforce.com

Related: [architecture.md](architecture.md) · [design/](design/README.md) (final screens) · [implementation-plan.md](implementation-plan.md)

---

## 1. Context

The internal Genie (`Desktop/Genie`) listens to a meeting on an employee's machine, extracts requirements, and builds a **locally hosted** Next.js or Expo prototype. Genie v2 is the externally shippable version:

| | Internal Genie | Genie v2 |
|---|---|---|
| Users | Employees | General public (self sign-up) |
| Input | Live two-speaker meeting via Parrot | One user speaking into the browser |
| Platforms | Web (Next.js) + Mobile (Expo) | **Web (Next.js) only** |
| Build trigger | Employee approves requirements | **Admin approves** the user's request |
| Build location | Local machine `generated/` | Cloud sandbox (E2B) |
| Delivery | `localhost` dev server | Admin QA, then public static URL (live 3 days) + email |
| Updates | Update agent on existing project | Not in Phase 1 (one-shot) |

### Goals (Phase 1)
1. Let anyone sign up and request a prototype by voice with no technical knowledge.
2. Give the team full visibility into what people want to build (manual review of every request).
3. Reuse the internal builder agent with minimal changes.
4. Keep cost and abuse bounded: **one free prototype per email**, **two requirement revisions**.

### Non-goals (Phase 1)
- Mobile/Expo prototypes.
- Updating a delivered prototype, or any second prototype.
- Payments or credits.
- Automated approval (planned for Phase 2, see §9).
- Prototypes with real backends, databases, auth, or external API calls (prototypes remain frontend-only with `localStorage`, same as internal Genie).

---

## 2. Actors & roles

| Role | Who | How assigned |
|---|---|---|
| **User** | Member of the public | Default on Clerk sign-up |
| **Admin** | Two internal employees | Clerk `publicMetadata.role = "admin"`, set manually in the Clerk dashboard |
| **System** | Requirement agent, builder worker, mailer | — |

---

## 3. User journey

```
Sign up (email) → Record → [Play back / re-record] → Generate requirements → Review summary
   → [Remark + regenerate ×≤2] → Approve (submit)   or   Decline (ends the request)
   → "An admin is verifying your requirements" screen + "request received" email
   → Admin reviews requirements → Approve → Build → Admin QA of the built prototype
        → Release → "Your prototype is ready" email → Link live for 3 days → Expired
   ↘ Admin declines (at requirements or at QA) → "Declined" email (with reason)
```

---

## 4. Business rules

| ID | Rule |
|---|---|
| BR-1 | Each **email** may have at most **one** prototype request ever submitted. Enforced in the database, not just the UI. |
| BR-2 | Emails are normalised before the uniqueness check: trimmed and lower-cased only. Dots and `+tag` are kept, because different addresses may belong to different people. Disposable-email domains are rejected at sign-up. |
| BR-3 | The quota survives account deletion: re-signing up with the same normalised email does not grant a new prototype. |
| BR-4 | A user may add a remark and regenerate requirements **at most 2 times** per request. |
| BR-5 | Before pressing *Generate requirements* the user can play back the recording and re-record any number of times. After generation the recording is locked; only remarks (BR-4) can change the requirements. |
| BR-6 | After generation (and any remarks) the user either **approves** (submits for admin review) or **declines** (ends the request). There is no return to the recorder. Declining **uses up the free prototype** (a paid tier allowing more prototypes comes later, §8). A submitted request also consumes the quota whether the admin approves or declines it. |
| BR-14 | Admins can only **accept or reject** requirements as the user approved them. Admins cannot edit requirements, so what gets built stays true to what the customer asked for. |
| BR-7 | The client IP is recorded at sign-up, recording start and submission. If the submission IP (or sign-up IP) matches any other user's recorded IP, the request is **flagged** in the admin queue. IP never blocks automatically. |
| BR-8 | Maximum recording length: **10 minutes**. Minimum: 15 seconds of speech. |
| BR-9 | Nothing is built without an explicit admin approval. |
| BR-10 | Released prototypes are reachable by anyone with the link (unlisted, not indexed). Admins can take a prototype offline at any time. |
| BR-11 | A built prototype is **not** shown to the user until an admin has QA'd it and pressed *Release*. Only then is the ready email sent. |
| BR-12 | A released prototype stays live for **3 days** from release, then expires automatically. The source and the static build are kept, so a later "redeploy" feature can bring it back without regenerating (see §8). |
| BR-13 | Builds are not cost-capped in Phase 1 (admins control what gets built). Cost per build is recorded so pricing and limits can be set later (§8). |

---

## 5. Functional requirements

### 5.1 Authentication & accounts
| ID | Requirement |
|---|---|
| FR-A1 | Users sign up / sign in through Clerk with **Google** or a **6-digit code sent by email**. There are no passwords. |
| FR-A2 | On first authenticated request the app creates a `users` row with normalised email and sign-up IP. |
| FR-A3 | Admin routes (`/admin/**`) and admin APIs are accessible only to users with role `admin`; others get 404. |
| FR-A4 | A user who has already submitted sees their request status instead of the recorder. |

### 5.2 Recording
| ID | Requirement |
|---|---|
| FR-R1 | User grants microphone permission and records in the browser with a visible timer, level meter, pause/resume and stop. |
| FR-R2 | Audio is captured as 16 kHz mono PCM, uploaded in ~30 s chunks while recording, so a closed tab loses at most one chunk. |
| FR-R3 | Recording auto-stops at 10 minutes, with a warning at 9 minutes. |
| FR-R4 | User can play back, discard and re-record before generating (BR-5). |
| FR-R5 | The page shows short prompts to help the user ("Who will use it? What should they be able to do? Any screens you imagine?"). |

### 5.3 Requirements generation
| ID | Requirement |
|---|---|
| FR-G1 | On Generate, the uploaded chunks are transcribed in parallel via OpenRouter (same speech-to-text approach as internal `transcription_agent`) and joined in order. |
| FR-G2 | The transcript is sent to the requirement agent (internal prompt adapted for a **single speaker describing their own idea**), producing `summary`, `intent`, `functional_requirements[]`, `user_stories[]`, plus a short `title`. |
| FR-G3 | The user sees a plain-language summary card (title, summary, what they'll be able to do). Full functional requirements and user stories are expandable. |
| FR-G4 | The user can enter a remark and regenerate (max 2, BR-4). The UI shows remaining revisions. Every version is stored. |
| FR-G5 | If transcription returns too little content to build from, the user is told what's missing and may re-record (this does not count as a revision). |
| FR-G6 | The user can **Approve** (submit for review) or **Decline** (ends the request, BR-6). Both ask for confirmation. |
| FR-G7 | Declining opens a warning dialog: *"If you decline, you can't regenerate these requirements and your free prototype will be used up."* The dialog has a text box for the reason the user doesn't want to continue (optional), stored with the request and shown to admins. |

### 5.4 Submission & notifications to user
| ID | Requirement |
|---|---|
| FR-S1 | Submitting locks the requirements, records the IP, evaluates the IP flag (BR-7) and sets status `pending_review`. |
| FR-S2 | User receives a "Request received" email. |
| FR-S3 | After approving, the user sees a screen saying an admin is verifying their requirements. The dashboard then shows: Verifying → Building → Ready (link + time left before expiry) → Expired, or Declined (with reason). Build failures and the QA step are shown to the user as "Building". |
| FR-S4 | On release: email with the prototype link and expiry date, sent to the user's sign-up email. On decline: email with the admin's reason. |

### 5.5 Admin panel
| ID | Requirement |
|---|---|
| FR-AD1 | Queue of requests filterable by status (pending review, building, awaiting QA, released, expired, failed, declined), sorted oldest-pending first. |
| FR-AD2 | Request detail: user email, sign-up date, IP flag with the matching accounts, audio playback, full transcript, all requirement versions and remarks, final requirements. |
| FR-AD3 | **Approve** (optional internal note) → enqueues a build. |
| FR-AD4 | **Decline** with a required reason (shown to the user) and an optional internal note. Reason categories are recorded (e.g. *unclear*, *out of scope*, *abusive*, *duplicate account*) for Phase 2. |
| FR-AD5 | Admins **cannot edit** requirements (BR-14). The only actions at review are Approve and Decline. User-declined requests appear in the queue as read-only, with the user's reason. |
| FR-AD6 | Build view: live status, agent step log, duration, model used, token/cost usage, errors. |
| FR-AD7 | **Retry** a failed build; **Take offline** / **Restore** a released prototype; **Download source** tarball. |
| FR-AD9 | **QA review:** a built prototype is in `awaiting_qa` with an admin-only preview link. Admin can **Release** (goes live, 3-day clock starts, ready email sent), **Rebuild** (new build attempt with an optional note to the agent about defects, e.g. "the save button does nothing"; the requirements themselves stay unchanged) or **Decline** (user gets the decline email). |
| FR-AD8 | Every user, admin and system action is written to the prototype's event timeline (`events`: who, which role, what, when) and shown on the request detail. |

### 5.6 Build & deploy (system)
| ID | Requirement |
|---|---|
| FR-B1 | On approval, a build job is queued. A worker (on Railway) picks it up, starts an E2B sandbox from a prebuilt template (Next.js template with dependencies installed), and runs the builder agent. |
| FR-B2 | The builder agent is the internal coding agent with the **same strict generation rules** as internal Genie (frontend-only, `localStorage` mock data, no backend/database/auth/external APIs) to save tokens and for security. Its tools (list/read/write/edit/delete file, run pnpm) execute inside the sandbox. |
| FR-B3 | The prototype must pass `pnpm lint`, `tsc --noEmit` and a **static export** `pnpm build` (`output: "export"`). |
| FR-B4 | Source (excluding `node_modules`, `.next`, `out`) and the static `out/` build are each saved as a `.tar.gz` in Supabase Storage. |
| FR-B5 | The static `out/` directory is uploaded to Cloudflare R2 under the prototype's slug and served at `https://{slug}.<prototype-domain>`, initially in **preview** state (admins only). |
| FR-B6 | A smoke check fetches the preview URL and confirms HTTP 200 and non-empty HTML before marking `awaiting_qa`. |
| FR-B7 | On success: status `awaiting_qa`, admins emailed to QA it. On failure after the automatic retry: status `build_failed`, admins alerted by email; the user still sees "Building". |
| FR-B8 | Each build is bounded technically (max 250 agent requests as internal, max 30 min sandbox lifetime) but not cost-capped (BR-13). Tokens and cost are recorded per build. |
| FR-B9 | A scheduled job expires released prototypes 3 days after release: the URL then shows "This prototype has expired" with a link to sign in to Genie. |

---

## 6. Non-functional requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-1 | Performance | Requirements shown ≤ 60 s after stopping a 10-min recording (p90). |
| NFR-2 | Performance | Build + deploy ≤ 20 min (p90) after approval. |
| NFR-3 | Availability | Prototype hosting 99.9% (Cloudflare). App and worker best-effort in Phase 1. |
| NFR-4 | Security | Generated code never runs on our app servers. It runs only in the E2B sandbox (during build) and as static files in visitors' browsers. |
| NFR-5 | Security | Prototypes are served from a **separate registrable domain** from the main app, so prototype JS cannot read app cookies. Each prototype has its own subdomain (own `localStorage` origin). |
| NFR-6 | Security | Prototype responses carry a CSP blocking all external network calls (`connect-src 'self'`), which enforces the "no external APIs" rule. |
| NFR-7 | Security | API keys (OpenRouter, E2B, R2, Resend, Supabase service role) live only on the server and in the worker, never in the sandbox or browser. |
| NFR-8 | Privacy | Audio and transcripts are retained 90 days after the request is closed, then deleted (transcript and requirements kept). Privacy policy and consent checkbox before first recording. |
| NFR-9 | Cost | No per-build cap in Phase 1 (BR-13). Per-build tokens and cost are recorded; an OpenRouter account-level alert warns on unusual spend. |
| NFR-10 | Observability | Structured logs for app and worker; build step log stored per build; error tracking (Sentry). |
| NFR-11 | Browser support | Latest Chrome, Edge, Safari and Firefox, desktop and mobile (recording works on iOS Safari). |

---

## 7. Acceptance criteria (Phase 1 done when…)

1. A new user can sign up, record ≤ 10 min, play back and re-record, generate, revise twice (a third attempt is refused by UI **and** API), and approve or decline.
2. The same email, in any letter case and after deleting and re-creating the account, cannot submit a second request.
3. A second account from the same IP shows an IP flag with the linked account in the admin queue.
4. Admin approve → build → prototype appears in the admin QA queue with a working preview link; the user has received no link yet.
5. Admin release → user receives the link by email; it works for anyone with the link.
6. Admin decline (at requirements or at QA) → user receives an email with the reason; the dashboard shows Declined.
7. A failed build is visible to admins with logs and can be retried.
8. A prototype that tries `fetch("https://example.com")` is blocked by CSP.
9. Three days after release the URL shows the "expired" page; admins can also take a prototype offline at any time.
10. The source tarball for every built prototype downloads and builds locally.

---

## 8. Out of scope / later improvements
- **Redeploy after expiry:** a signed-in user can bring their expired prototype back for another period. This is cheap because the static build is kept (BR-12), so no rebuild or tokens are needed.
- **Paid version:** allows multiple prototypes per account (and a fresh start after a user decline).
- **Pricing and limits:** once per-build cost data exists, set per-build cost caps and tuned recording limits.
- Prototype updates and versioning (internal update agent exists, so this can come back later).
- Mobile/Expo.
- Paid tiers, extra prototypes.
- Team/shared accounts.
- Custom domains for prototypes.

## 9. Phase 2 preview — automated review
Phase 1 is designed to collect the data an auto-reviewer needs:
- Every decision is stored with a category, reason and the exact requirements reviewed.
- A **review agent** first runs in *shadow mode*: it scores each request against written acceptance criteria (clear intent, buildable as a frontend-only app, not abusive, not a duplicate) and records `approve | decline | escalate` next to the admin's real decision.
- When agreement is high enough, `approve` with high confidence and no IP flag can auto-start the build, while `escalate` still goes to admins.

## 10. Open questions
| # | Question | Default used in this plan |
|---|---|---|
| Q4 | Exact prototype domain? | **Deferred.** App: `genie.gluonforce.com`. Prototypes: a separate `.app` domain, name to be chosen later. `genie.app` is registered by a third party; `genieprototype.app` / `genieproto.app` were available on 2026-11-09. |
| Q5 | Should the user be able to add a typed note alongside the recording? | No. |
| Q6 | Languages other than English? | English only (as internal). |

Resolved: user decline uses up the free prototype (BR-6, FR-G7); admins can't edit requirements (BR-14); slug format `{kebab-title}-{4–6 random chars}`, e.g. `to-do-list-k3x9`; two admin checks, requirements review and QA before release (BR-9, BR-11); sign-in is Google or an emailed 6-digit code, with no passwords (FR-A1).
