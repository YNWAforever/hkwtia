# Member B Auth/browser UAT on live production — 2026-10-26

Recorded 2026-10-26 (Asia/Hong_Kong) on PR #212 branch `wtia/hkwtia-plan-r1-20261025`. Machine-readable copy: [auth-browser-live-member-b-manifest.json](auth-browser-live-member-b-manifest.json). No passwords, tokens, magic-link URLs or cookies are recorded; account emails are omitted.

## Target and tested code (read first)

| Item | Value |
| --- | --- |
| Host | `https://hkwtia.vercel.app` — production alias, **no Vercel Deployment Protection wall** |
| Deployment | `dpl_5TMerrJ1oURQsBYhau8cNrUHCLmi` (target `production`, READY, created 2026-10-20 03:44 HKT) |
| Deployed commit | `release` @ `6833eb9a` = "release: promote main@3eb9992d to production" (PR #208) |
| Relation to PR #212 | `main@3eb9992d` is an ancestor of the PR head; the R2 branch carries **45 further commits** not deployed. This is **deployed-production evidence for existing features, not exact-head evidence for PR #212**. |
| Mode | Read-only walk. No form saved, no write flag, no Stripe action, no admin action, no deployment. |

## Auth surface

- Login UI offers **passwordless magic link (Neon Auth)** and **Google**. There is no password field; vault passwords were not used.
- **Member B** signed in via magic link and landed on `/portal`.

## Member B observations

| Route | Observation | Result |
| --- | --- | --- |
| `/portal` | Greeting "Welcome back, WTIA member."; membership **Community, ACTIVE, 1 seat** | PASS (observed) |
| `/portal/applications` | Own list: Community — Complete (17 Oct 2026); Startup — Draft (29 Sept 2026) | PASS (observed) |
| `/portal/profile` | Editable form rendered; **not saved** | PASS (observed, read-only) |
| `/portal/events/my` | Empty state | Observed (empty) |
| Company / listing | Gated for Community tier | Observed (gate) |
| Seats | Empty state | Observed (empty) |
| Events / directory | Empty state | Observed (empty) |
| Tools | Gated (Startup / Corporate / Patron only) | Observed (gate) |
| Documents | Empty state | Observed (empty) |
| Billing | ACTIVE Community | Observed |
| `/admin` as member B | Redirected to `/admin-login`: "Staff access is unavailable for this account" | PASS (denied, NONSTAFF refusal observed) |

"PASS (observed)" is a per-step observation only. **No UC is PASS** from this run: every touched UC also needs member A, staff D, exact-head deployment, DB readback, screen reader and/or Stripe evidence.

## Not exercised

- **Member A and staff D**: their vault logins are gmail.com addresses; the Gmail connected for this run was a different (Fimmick) inbox, so their magic links were not received or used. The B-vs-A negative control, staff positive control and all staff-side cases remain open.
- No `next=` round-trip through magic link (UC22-06), no application detail/supplement view (UC22-24), no writes of any kind, no zero-write DB readback for the refused `/admin` attempt, no screen reader, no Stripe.

## Inventory effect

| UC | Before → after | Reason |
| --- | --- | --- |
| UC22-12 | BLOCKED → **PARTIAL** | Real member B session exists on production; B-vs-A comparison still needs A |
| UC22-13 | BLOCKED → **PARTIAL** | Real NONSTAFF (member B) refusal at `/admin` observed; staff D positive control and zero-write readback open |
| UC22-01, 08, 21, 22, 23, 29, 30, 35, 36, 50 | PARTIAL (unchanged) | Live B evidence attached; A/staff/exact-head layers open |
| UC22-39 | BLOCKED (unchanged) | Documents empty for B; T-MP08 materials and A/staff still open |

Counts: **0 PASS / 48 PARTIAL / 12 BLOCKED / 0 NOT RUN**.
