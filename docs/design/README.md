# Genie v2 — Design

Final UI design for Phase 1 (style 8, "One long track"), agreed on 2026-11-10. Companion to [requirements.md](../requirements.md) and [architecture.md](../architecture.md).

- **Live, clickable canvas:** https://claude.ai/artifact/6oyX7cUruRhxDiWqgWH8A2 (private; share it from its Share menu).
- **One-page overview of the product:** [genie-v2-overview.html](genie-v2-overview.html) (opens in any browser).
- **Screen source:** [screens/](screens/), one `.dc.html` file per screen. These are design-tool files: they load a `support.js` runtime that only the canvas provides, so open them on the canvas, not directly in a browser. Developers should copy markup, spacing and copy from them, not ship them. `canvas.json` still lists five style-option boards that were not exported; ignore those entries.

## Screens

| File | Screen | App route (planned) | Requirements |
|---|---|---|---|
| `Main.dc.html` | Landing page, with plans and footer | `/` | §1 goals, plans in §8 |
| `SignUp.dc.html` | 1 · Sign up (no password). Built with Clerk's `<SignUp />` styled to match, which also offers Google. | `/sign-up`, `/sign-in` | FR-A1, BR-2 |
| `VerifyEmail.dc.html` | 2 · 6-digit email code (Clerk's own code step, styled) | `/sign-up/verify-email-address` | FR-A1 |
| `Record.dc.html` | 3 · Recording | `/app/record` | FR-R1–R3, FR-R5 |
| `RecordReview.dc.html` | 4 · Play back, record again or generate | `/app/record` | FR-R4, BR-5 |
| `Generating.dc.html` | 5 · Generating requirements | `/app/requirements` (pending) | FR-G1, FR-G2 |
| `Requirements.dc.html` | 6 · Requirements, change requests, approve or decline | `/app/requirements` | FR-G3, FR-G4, FR-G6 |
| `DeclineDialog.dc.html` | 7 · Decline warning with reason | dialog on `/app/requirements` | FR-G7, BR-6 |
| `StatusReview.dc.html` | 8 · Waiting for team review | `/app` | FR-S3 |
| `StatusLive.dc.html` | 9 · Prototype is live | `/app` | FR-S3, FR-S4 |
| `StatusClosed.dc.html` | 10 · Declined by team, declined by user, or expired (3 variants) | `/app` | FR-S3, FR-S4, FR-B9 |
| `ReadyEmail.dc.html` | "Your prototype is ready" email | Resend template | FR-S4 |
| `AdminQueue.dc.html` | A1 · Queue with status tabs | `/admin` | FR-AD1 |
| `AdminReview.dc.html` | A2 · Review requirements (read only) | `/admin/prototypes/[id]` | FR-AD2, FR-AD3, FR-AD5 |
| `AdminDecline.dc.html` | A3 · Decline with category and reason | dialog | FR-AD4 |
| `AdminQA.dc.html` | A4 · QA the built prototype | `/admin/prototypes/[id]` (awaiting QA) | FR-AD9, FR-B6 |
| `AdminRecord.dc.html` | A5 · Prototype record and event log | `/admin/prototypes/[id]` (live / closed) | FR-AD6–AD8 |

The user app shows one screen per prototype status, so `/app` routes the user to the right screen from `prototypes.status`.

## Design tokens

| Token | Value | Use |
|---|---|---|
| `navy` | `#101B4D` | Text, primary buttons, heavy rules |
| `coral` | `#FF4B3A` | Sound wave, record dot, progress done, accents |
| `coral-soft` | `#FFC9C1` | Unplayed part of a wave |
| `blush` | `#FFECE8` | User app background, highlighted rows |
| `ink-muted` | `#4A5278` | Secondary text |
| `rule` | `#C9CCDA` | Light dividers, inactive progress |
| `rule-blush` | `#E8BDB6` | Dividers on blush background |
| `admin-bg` | `#F4F5FA` | Admin background |
| `admin-rule` | `#E6E9F7` | Admin table dividers, neutral pills |
| `amber` | `#FFE9B8` on `#5C3600` | "Waiting", "Pending approval", "Ready for QA", warnings |
| `success` | `#DDF3EA` on `#0B5A3F` | "Live" |
| `danger` | `#A31F12`; tint `#FFDAD5` on `#8A1A0E` | Decline actions, "Not accepted" |
| Dialog backdrop | `#4A4F73` | Behind modal dialogs |

- **Type:** Unbounded 800 (500 for the timer label) for headings, wordmark and numbers; Onest 400/500/700 for everything else. Body 17px user app, 16px admin.
- **Shapes:** pill buttons (`999px`), inputs 14px radius with 2px navy border, cards 28px (user) / 20px (admin), section rules 4px navy with 2px light rules between items, 6px progress segments.
- **Signature element:** the sound-wave track (flex row of rounded bars with a navy playhead). It appears on the landing hero, recording, playback, status and email screens.

## Copy decisions

- Users see **"change requests"** for what the requirements doc calls *remarks* (limit 2, BR-4).
- Admins see **"Pending approval"** for the database status `pending_review`.
- The example idea throughout is **"Supplier invoice approvals"**.
- Placeholders still to fill: `[PRICE]`, `[REVIEW AND BUILD TIME]`, `[CONTACT EMAIL]`, `[SENDER ADDRESS]`, `[YOUR-DOMAIN]` (prototype domain, open question Q4).
