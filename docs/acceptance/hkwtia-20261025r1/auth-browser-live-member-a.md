# Member A Auth/browser UAT on live production — 2026-10-27

Recorded 2026-10-27 (Asia/Hong_Kong) on PR #212 branch `wtia/hkwtia-plan-r1-20261025`. Machine-readable copy: [auth-browser-live-member-a-manifest.json](auth-browser-live-member-a-manifest.json). Companion records: [member B run](auth-browser-live-member-b.md), [earlier member A magic-link finding](auth-browser-live-member-b.md#member-a-magic-link-attempt--2026-10-26-finding) and [branch fix](auth-browser-live-member-b.md#root-cause-and-fix-branch-not-deployed). No passwords, tokens, magic-link URLs, verifier values or cookies are recorded; account emails are omitted (only the app's own masked form is referenced).

## Target and tested code (read first)

| Item | Value |
| --- | --- |
| Host | `https://hkwtia.vercel.app` — production alias, **no Vercel Deployment Protection wall** |
| Deployment | `dpl_5TMerrJ1oURQsBYhau8cNrUHCLmi` (target `production`, READY, created 2026-10-20 03:44 HKT) — re-read via Vercel on 2026-10-27; alias unchanged since the member B run |
| Deployed commit | `release` @ `6833eb9a` = "release: promote main@3eb9992d to production" (PR #208) |
| Relation to PR #212 | **Older release.** PR #212's stale-cookie verifier exchange fix `a34a631c` is **not deployed**. This is deployed-production evidence for existing features, **not** exact-head evidence for PR #212. |
| Mode | Read-only walk. No form saved, no write flag, no Stripe action (Continue payment **not clicked**), no admin action, no deployment. |

## Sign-in path

1. Box browser cookies for `hkwtia.vercel.app` were cleared and an empty jar verified (clean cookie context, per the requested retest).
2. Automated magic-link send for member A from `/member-login` produced **no network request, no console error and no UI change** (button click and Enter, two attempts). See the [operational note](#operational-note--sessionstorage-resend-cooldown-and-controlled-email-input) below; cookie clearing alone did not help.
3. Willy then signed member A in **via Google** in the box browser. Landing: `/portal`.
4. A second tab showed `/member-login?sent=1` with the app's masked recipient (`l***@g***.com`) — consistent with an earlier send having been accepted by the server at an unrecorded time. No link from that send was opened in this run.

Result: a real member A session exists on production **via Google OAuth only**. The member A **magic-link** path is still **not confirmed** on production after clean cookies, and the [stale-cookie diagnosis](auth-browser-live-member-b.md#root-cause-and-fix-branch-not-deployed) is therefore neither confirmed nor refuted live by this run (the Google path does not use the magic-link verifier exchange).

## Member A observations

| Route | Observation | Result |
| --- | --- | --- |
| `/portal` | Header chip/display "Test"; dashboard membership **Corporate, PAYMENT PENDING, 25 seats** | PASS (observed) |
| Identity copy | Chip "Test" vs profile display name "WTIA member" (also used as heading elsewhere) — **inconsistent display identity** | Finding (not diagnosed) |
| `/portal/profile` | Display name "WTIA member"; job title "Test"; phone/WhatsApp present (values not recorded); directory listing **off**; **not saved** | PASS (observed, read-only) |
| `/portal/company` | Company "Test"; public page **HIDDEN** | PASS (observed, read-only) |
| `/portal/company/seats` | "Seat access is unavailable for this company…" despite dashboard showing 25 seats | Finding — likely gated by PAYMENT PENDING; not diagnosed |
| `/portal/billing` | **PAYMENT PENDING**, Corporate, 25 seats; **Continue payment** button present, **not clicked** | Observed (no Stripe action) |
| `/admin` as member A | Redirected to `/admin-login`: staff access unavailable for this account | PASS (denied, NONSTAFF refusal observed; expected for member) |
| Session persistence | Session stayed signed in across `/portal`, `/portal/profile`, `/portal/company`, `/portal/company/seats`, `/portal/billing` and after the `/admin` denial | PASS (observed) |

"PASS (observed)" is a per-step observation only. **No UC is PASS** from this run: the checklist requires PR #212 exact-head (Preview) evidence, and the touched UCs also need staff D, DB readback, screen reader and/or Stripe evidence.

### A vs B (observation level)

Member A (Corporate, PAYMENT PENDING, 25 seats, company "Test" HIDDEN) and member B (Community, ACTIVE, 1 seat, company gated) render distinct, account-specific dashboards on the same production build. This is **not** the B-vs-A negative control: no cross-account access attempt (e.g. B requesting A's company/seat/application routes or IDs) was made.

## Operational note — sessionStorage resend cooldown and controlled email input

Separate from the auth defect; docs only, **no product code change**.

- `components/auth/sign-in-form.tsx` stores a resend deadline in `sessionStorage` under `hkwtia-login-resend-<intent>` (member: `hkwtia-login-resend-member`). `onSubmit` calls `preventDefault()` while `remaining > 0` **or** the stored deadline is in the future. **Clearing cookies does not clear this key**; it persists per tab/origin until expiry or tab close. Existing unit coverage (`tests/unit/sign-in-form.test.tsx`) asserts this cooldown deliberately blocks submission.
- On the current code the visible "Wait N" hint and disabled button are driven by the same deadline, so a fully silent block is only expected in the brief window before the first timer tick. The second plausible cause in automation is the **controlled email input**: `value={email}` is React state updated only by `onChange`; automation that sets the DOM value without React's input event leaves state empty, so the `required` field fails native validation (no request, no console error).
- Neither cause was isolated live. **UAT procedure:** before a magic-link retest, clear site cookies **and** `sessionStorage` for the origin (or use a fresh private window/tab), type the email with real keystrokes, and wait out any displayed "Wait N".
- Possible UX follow-up (not in scope, not implemented): surface the remaining wait even when submit is blocked by a stored deadline. No inventory row expects a fix commit for this.

## Not exercised

- Member A **magic-link** sign-in on production in a clean cookie + sessionStorage context (still the UC22-11 positive-control gap for the magic-link path).
- PR #212 exact-head deployment (Preview behind Vercel SSO; fix `a34a631c` undeployed) — fresh-A and same-browser-after-B retests.
- Staff D; B-vs-A cross-account access attempt; any write (profile/company/seat); Stripe (Continue payment not clicked); zero-write DB readback after the `/admin` refusal; screen reader; `next=` round-trip via magic link; documents/resources, applications, events and directory routes for A.

## Inventory effect

| UC | Before → after | Reason |
| --- | --- | --- |
| UC22-11 | BLOCKED → **PARTIAL** | Real member A session on production (Google). Magic-link path unconfirmed; PR #212 fix undeployed; exact-head/staff D open |
| UC22-12 | PARTIAL (unchanged) | A session now exists; distinct A/B dashboards observed; cross-account negative control not attempted |
| UC22-13, UC22-50 | PARTIAL (unchanged) | Second NONSTAFF refusal (member A) observed; staff D and zero-write readback open |
| UC22-08 | PARTIAL (unchanged) | Member A `/admin` → `/admin-login` refusal also observed |
| UC22-22 | PARTIAL (unchanged) | PAYMENT PENDING status rendered for A (in addition to B's ACTIVE) |
| UC22-29 | PARTIAL (unchanged) | A's company page viewed read-only (HIDDEN); edit not exercised |
| UC22-30 | PARTIAL (unchanged) | Seat page "unavailable" vs dashboard 25 seats recorded as a finding; assignment not exercised |
| UC22-15 | BLOCKED (unchanged) | Billing shows Continue payment for PAYMENT PENDING Corporate; Stripe not exercised |

Counts: **0 PASS / 49 PARTIAL / 11 BLOCKED / 0 NOT RUN**.
