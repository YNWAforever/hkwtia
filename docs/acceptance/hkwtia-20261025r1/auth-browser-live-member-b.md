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

## Member A magic-link attempt — 2026-10-26 (finding)

Same host and deployment (`https://hkwtia.vercel.app`, production `release@6833eb9a`; **not** a PR #212 deploy). No token, verifier value, cookie or email is recorded.

| Step | Observation |
| --- | --- |
| First paste | A previously used **member B** token was pasted by mistake → Neon Auth `INVALID_TOKEN` (expected: single-use token reuse rejected) |
| Fresh A link #1 and #2 | Two fresh member A magic links, tokens distinct from B. Neon Auth verify **succeeds** (no `INVALID_TOKEN`) and redirects to `/member-login?next=/portal&neon_auth_session_verifier=ml-…` |
| After redirect | The `neon_auth_session_verifier` parameter **never clears**; `/member-login` does not complete the session (second attempt waited ~45 s) |
| `/portal` | Redirects back to `/member-login`; **no member A session was established** |
| Google OAuth | Not tried |

Interpretation (not root-caused): the provider-side verify works, but the app-side exchange of the session verifier on `/member-login` does not complete for member A on the production build, whereas member B's identical flow landed on `/portal`. Candidate areas for diagnosis: the verifier exchange/cookie set on the production origin, account/identity resolution for A (e.g. member record linkage), or timing. No retry with Google, no code change and no production data inspection were done.

Inventory effect: UC22-11 stays **BLOCKED**, now with this live evidence and a narrowed blocker; UC22-12 stays PARTIAL (B-vs-A comparison impossible without an A session). Counts unchanged: **0 PASS / 48 PARTIAL / 12 BLOCKED / 0 NOT RUN**.

Follow-up 2026-10-27: member A later signed in on production **via Google** in a clean cookie jar; magic-link path still unconfirmed. See [auth-browser-live-member-a.md](auth-browser-live-member-a.md). UC22-11 is now PARTIAL.

### Root cause and fix (branch, not deployed)

Code inspection confirms a cookie-presence defect matching this failure; it does **not** prove which cookies were in the live browser. `main@3eb9992d:proxy.ts:73–75` (also present at branch baseline `488d220a`) returned before exchange whenever `__Secure-neon-auth.session_token` existed, without validating it. This explains a verifier that never clears and no refusal warning after B in the same browser. The portal proxy likewise skips its anonymous redirect on cookie presence; the portal layout then redirects an unresolved actor to login (`app/[locale]/(member)/portal/layout.tsx:62–76`). `lib/auth/server.ts:59–79` validates with cookie cache and refresh disabled and treats the forbidden Server Component cookie-mutation path as signed out.

PR #212 now attempts every supplied verifier (`proxy.ts:70–75`), stripping the existing session token and `__Secure-neon-auth.local.session_data` from a cloned exchange request only (`proxy.ts:88–104`). Other cookies remain; the original request and browser cookies are untouched on refusal. This isolation is necessary: installed `@neondatabase/auth/dist/server-b0OzGjXl.mjs:1298–1335,1368–1388` can answer get-session from a valid old cache or reactively mint cache from the old token **before** processing the verifier. On a cache miss, `:1210–1215` forwards Neon cookies upstream; `:1196–1203` preserves the verifier query. Removing the guard alone could therefore retain B's session or forward a stale credential. New Set-Cookie headers are relayed together on the clean-URL redirect (`proxy.ts:120–124`); SDK minting uses the same secure cookie names and root path (`:601–611`). No custom cookie domain is configured here.

Sign-out uses `authClient.signOut()` in `components/portal/portal-sign-out-button.tsx:30–35`, through `app/api/auth/[...path]/route.ts`. It delegates token deletion to Neon. The SDK relays upstream Set-Cookie attributes, forces Secure/SameSite, and adds a root-path, host-only session-data deletion when the token deletion has Max-Age=0 or an expired Expires (`server-b0OzGjXl.mjs:636–658,1251–1268`). Thus both cookies should clear on a normal upstream deletion; there is no local unconditional clear or evidence that this browser received one. Different legacy path/domain cookies or a failed sign-out cannot be excluded without browser evidence. No sign-out change is needed for the exchange fix.

Account/role/callback hypotheses: the callback send action builds a localized member-login URL with the allowlisted continuation (`app/[locale]/member-login/actions.ts:27–44,94–96`); the observed callback reaches that route. Exchange precedes page/profile resolution and has no account, email-verification, membership or role branch. On this branch an authenticated subject without a profile gets onboarding, a wrong role gets a forbidden state, and read failures get a recovery state (`lib/auth/login-resolution.ts:22–36`; `app/[locale]/member-login/page.tsx`). The portal can redirect a session with no resolved profile back to login (`lib/auth/actor.ts:22–27,61–64`), but that cannot itself prevent a successful exchange from stripping the verifier. These are excluded as causes of the exchange suppression, **not** as claims about A's production identity; no production data was read.

A spent verifier's rejection is enforced by the hosted backend, whose implementation is not in the installed SDK. The earlier INVALID_TOKEN observation concerns an emailed token, not the callback verifier, so it does not prove verifier replay semantics. Local tests prove that a refused/no-cookie response leaves the original session untouched and does not redirect; hosted fresh-verifier/replay acceptance remains open. Upstream exceptions still fall through. A dedicated “expired or used” UI was considered and deferred: this proxy cannot distinguish expiry/replay from upstream failure or a 200 response without a cookie, so that wording would assert an unverified cause. The existing refusal warning remains free of credentials.

Test-first: Node 22 focused run on the old implementation: **2 failed / 8 passed**, both new stale-cookie tests failed because upstream was called zero times. With the fix, proxy/login-resolution/member-login-actions: **25 passed**. Regression coverage verifies both cookie headers relayed, verifier removed only on success, stale session/cache excluded from the forwarded request, unrelated cookies retained, original request unchanged, and refused exchange falling through without a loop. Full verification is recorded in `r2-progress.md`.

Retest only on a deployment of this branch: request a fresh A link, follow it in the same browser, confirm the verifier disappears and `/portal` resolves A; repeat after a B sign-in in that browser, including an expired/invalid B session. Replay the callback only in an authorized acceptance environment to verify backend refusal preserves an existing session. Do not record credentials or cookie values. On current production, clearing site cookies or using a private window **before requesting a fresh link** is a code-derived workaround for this cookie-presence defect, not a verified remedy for A. Fix on PR #212 not deployed; A session never established. UC22-11 remains BLOCKED; **0 PASS / 48 PARTIAL / 12 BLOCKED / 0 NOT RUN**.
