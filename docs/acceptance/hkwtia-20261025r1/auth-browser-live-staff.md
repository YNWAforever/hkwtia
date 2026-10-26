# Staff Auth/browser UAT on live production — 2026-10-27

Recorded 2026-10-27 (Asia/Hong_Kong) on PR #212 branch `wtia/hkwtia-plan-r1-20261025`. Machine-readable copy: [auth-browser-live-staff-manifest.json](auth-browser-live-staff-manifest.json). Companion records: [member B run](auth-browser-live-member-b.md), [member A run](auth-browser-live-member-a.md). No passwords, tokens, magic-link URLs, verifier values, cookies, email addresses or phone numbers are recorded.

## Target and tested code (read first)

| Item | Value |
| --- | --- |
| Host | `https://hkwtia.vercel.app` — production alias, **no Vercel Deployment Protection wall** |
| Deployment | `dpl_5TMerrJ1oURQsBYhau8cNrUHCLmi` (target `production`, READY, created 2026-10-20 03:44 HKT) — same alias as the member A/B runs |
| Deployed commit | `release` @ `6833eb9a` = "release: promote main@3eb9992d to production" (PR #208) |
| Relation to PR #212 | **Older release.** PR #212 (incl. fix `a34a631c`) is **not deployed**. This is deployed-production evidence for existing features, **not** exact-head evidence for PR #212. |
| Mode | Read-only walk. No approval, no queue/case action, no message sent, no form saved, no write flag, no Stripe action, no deployment. |

## Sign-in path

1. Member A was signed out; site data for `hkwtia.vercel.app` (cookies and storage) was cleared via the browser's site-data UI and an empty cookie jar was confirmed before login.
2. `/admin-login` offered **Google** and **magic link**.
3. Willy signed staff in **via Google** in the box browser (handoff). Landing: `/admin`.
4. The staff **magic-link** path was **not tested** in this run.

Identity shown: **Willy Lai**, role **Superadmin**, Staff workspace. This is a real staff session, but it is the owner's Superadmin account — **not** the staff D fixture identity/role the checklist names.

## Staff observations

| Route | Observation | Result |
| --- | --- | --- |
| `/admin` | Staff workspace; identity Willy Lai, Superadmin | PASS (observed) |
| `/admin` dashboard queues (snapshot ~2026-10-27 12:52 AM HKT) | 5 unfinished applications; **1 submitted**; 0 member pages to review; 0 listings to review; 0 pending approvals; 3 open staff tasks (CANARY 20261019 "Follow up documents"); 0 at-risk; 0 draft news. Records: 4 profile records, 1 active membership, 1 unrevoked company seat | Observed (read-only) |
| `/admin/members` | Rendered in session | PASS (observed) |
| `/admin/members/queue` | "Applications and payments" queue rendered | PASS (observed); dashboard-vs-queue ID set **not compared** |
| `/admin/events-mgmt` | Lists "WTIA Global Growth Demo Briefing" | PASS (observed) |
| `/admin/inbox` | "No conversations yet" | Observed (empty) |
| `/admin` (return) | Session still signed in | PASS (observed) |
| `/portal` as staff | Redirected to `/admin` (staff do not see the member portal) | PASS (observed separation) |
| Session persistence | Sticky across `/admin` → `/admin/members` → `/admin/members/queue` → `/admin/events-mgmt` → `/admin/inbox` → `/admin` and the `/portal` redirect | PASS (observed) |

"PASS (observed)" is a per-step observation only. **No UC is PASS** from this run: the checklist requires PR #212 exact-head (Preview) evidence, and the touched UCs also need the staff D role identity, DB readback, ID-set comparison, writes and/or Stripe evidence.

### Staff vs members (observation level)

With member B (`/admin` → `/admin-login` refusal) and member A (same refusal) already recorded, this run adds the positive side: a staff account reaches `/admin` and its sub-routes, and staff are kept out of `/portal`. The dashboard's 1 active membership / 1 unrevoked company seat / 4 profile records are a point-in-time snapshot and were **not** reconciled against the member A/B dashboards or the database.

## Not exercised

- Staff **magic-link** sign-in; staff D fixture role (non-Superadmin staff) and role-scoped permissions.
- Any write: approvals, queue/case actions, bulk actions, import, member/company edits, event edits, inbox messages.
- Dashboard "1 submitted" vs queue submitted ID-set comparison (UC22-42) and queue filter/paging (UC22-43).
- Opening an application case, draft review/adopt, staff tasks.
- Zero-write DB readback after the member A/B NONSTAFF refusals.
- PR #212 exact-head deployment (Preview behind Vercel SSO).
- Member→staff→member same-application round trip (UC22-60); Stripe; screen reader.

## Inventory effect

| UC | Before → after | Reason |
| --- | --- | --- |
| UC22-13 | PARTIAL (unchanged) | Real staff session (Superadmin, Google) positive control observed alongside A/B refusals; staff D fixture role, zero-write readback and exact-head open |
| UC22-50 | PARTIAL (unchanged) | Staff positive access + A/B NONSTAFF refusals observed; zero-write readback and staff D role open |
| UC22-08 | PARTIAL (unchanged) | Staff `/portal` → `/admin` redirect observed |
| UC22-11 | PARTIAL (unchanged) | Staff D blocker reworded (Superadmin session exists; staff D role not used) |
| UC22-42 | PARTIAL (unchanged) | Dashboard "1 submitted" observed live; queue ID set not compared |
| UC22-43 | PARTIAL (unchanged) | Queue page rendered in staff session; filter/list behaviour not exercised |
| UC22-33 | PARTIAL (unchanged) | Dashboard review counts (0 member pages, 0 listings) observed; no review performed |
| UC22-21/22/23/29/30/35/36/39 | Status unchanged | Blocker reworded: staff session now exists; staff walk of these routes not done |

Counts: **0 PASS / 49 PARTIAL / 11 BLOCKED / 0 NOT RUN** (unchanged).
