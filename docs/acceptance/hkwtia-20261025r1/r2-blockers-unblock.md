# R2 remaining blockers — live status and unblock paths — 2026-10-27

Recorded 2026-10-27 ~01:26 Asia/Hong_Kong on PR #212 branch `wtia/hkwtia-plan-r1-20261025` at HEAD `7c8e3308`. Inventory at record time: **0 PASS / 49 PARTIAL / 11 BLOCKED / 0 NOT RUN**. No production deploy, no spend, no `stacked-ci-trigger.patch` application, no Deployment Protection disable, no automation-bypass secret mint, no invented Stripe values.

Companion: [r2-progress.md](r2-progress.md), [t22-07-inventory.md](t22-07-inventory.md), [stacked-ci-trigger.patch](stacked-ci-trigger.patch) (prepared only).

## BLOCKED inventory rows (UC status BLOCKED)

| UC | Theme | What still blocks |
| --- | --- | --- |
| UC22-15 | Paid join checkout | Stripe test mode; Auth/HTTP; notification sink |
| UC22-20 | No second subscription | Stripe test mode; Auth/HTTP |
| UC22-32 | External tool identity exchange | T-MP12A/B contract (owner input) |
| UC22-37 | Ticket purchase | Stripe test mode; Auth/HTTP; sink |
| UC22-38 | Stripe webhook processing | Stripe test mode |
| UC22-39 | Approved member resources | T-MP08 owner materials + private delivery; exact-head |
| UC22-40 | Receipts | Stripe test mode; T-MP08; Auth |
| UC22-41 | Cancellation/refund policy | T-MP10 legal approval; Stripe test mode |
| UC22-54 | External tool authorization | T-MP12A/B |
| UC22-59 | Exact-head CI gate | GitHub Actions billing on #211; stacked base filter; patch **unapplied by design** until billing is fixed |
| UC22-60 | Member→staff→member readback | Auth/HTTP; bound forms unmounted; write flag disabled |

PARTIAL rows still carry open layers (Preview SSO, magic-link A/staff, staff-D fixture, zero-write DB readback, screen reader, exact-head). Those are not counted in the 11 BLOCKED rows above.

## Live checks this turn

### Preview Deployment Protection

| Fact | Value |
| --- | --- |
| Project | `hkwtia` / `prj_lT7YZDueA6kzhz2xrPPHFyNsDf8n` (team `ynwaforevers-projects` / `team_qvzlsFmfCsLkgItSypqHjw3z`) |
| SSO protection | **enabled**, `deploymentType=prod_deployment_urls_and_all_previews` |
| Password protection | disabled |
| Latest PR #212 Preview | `dpl_2PJRwnya2prEY68ZE43aMpgbQFgG` → `https://hkwtia-l4eh06gmt-ynwaforevers-projects.vercel.app` (SHA `7c8e3308`, READY) |
| Stable Preview alias | `https://hkwtia-git-wtia-hkwtia-plan-r1-20261025-ynwaforevers-projects.vercel.app` |
| Unauthenticated GET `/` | **HTTP 302** → `https://vercel.com/sso-api?url=…` (SSO wall confirmed) |
| Production custom domain `https://hkwtia.vercel.app` | Open (no SSO wall); still **older** `release@6833eb9a`, not PR #212 |
| Box `vercel` CLI | ~~Logged out~~ → **superseded 2026-10-27 ~01:50 HKT**: logged in as `ynwaforever`, linked to `ynwaforevers-projects/hkwtia`; OIDC proven (see [Preview OIDC proven](#preview-oidc-proven--2026-10-27)) |
| Vercel MCP | Authenticated (can list project/deployments/envs); does **not** substitute for CLI OIDC or browser Trusted Sources |

**Do not** disable Deployment Protection or mint a long-lived automation bypass as the first fix. Prefer the Trusted Sources / development OIDC path below. Production custom-domain protection must stay as-is.

### Stripe price wiring (presence only; no secret values)

| Location | Observation |
| --- | --- |
| `.env.example` | Documents `STRIPE_STARTUP_PRICE_ID`, `STRIPE_CORPORATE_PRICE_ID`, and `STRIPE_TEST_*` counterparts (empty placeholders) |
| Local `.env.acceptance.local` | **No** Stripe keys at all (DB acceptance allowlist only) → anonymous suite four-tier asserts stay red by design |
| Vercel Production env | `STRIPE_STARTUP_PRICE_ID` and `STRIPE_CORPORATE_PRICE_ID` present (encrypted) |
| Vercel Preview env (default) | Same price ID keys present (encrypted); branch-scoped `codex/paid-application-completion-20261015` sensitive stubs appear empty |
| Vercel Preview `STRIPE_TEST_SECRET_KEY` | Present as sensitive entries but **no decrypted/set value observed** in the non-decrypt list (checkout/webhook test still need Willy) |
| Anonymous e2e | Soft-asserts four tiers; comments already mark paid tiers as deliberately unconfigured in local acceptance |

Unblocking local four-tier without inventing secrets: Willy supplies real **test-mode** `STRIPE_TEST_STARTUP_PRICE_ID` / `STRIPE_TEST_CORPORATE_PRICE_ID` (and maps them into the acceptance runtime the same way M2 docs do), **or** agents run the anonymous catalog check against Preview after SSO access (Preview default env already has startup/corporate price IDs).

### GitHub Actions / stacked CI

| Fact | Value |
| --- | --- |
| PR #212 Actions runs on head branch | **None** (base `wtia/five-role-acceptance-20261025` not in `ci.yml` `pull_request.branches`) |
| PR #212 checks | Vercel Preview Comments SUCCESS; Vercel deployment SUCCESS; Bugbot SUCCESS only |
| PR #211 CI run `40202185833` | All jobs (`checks`, `tests (1/2)`, `worker`, `quality`) **FAILURE** with **zero steps executed** — consistent with GitHub Actions billing/spending-limit runner refusal |
| `stacked-ci-trigger.patch` | Prepared under this folder; **must not be applied** until billing is fixed (applying it alone cannot green CI) |

## Preview access paths (ordered)

### 1. Preferred — CLI Trusted Sources / OIDC (same-project Preview)

Per `access-protected-vercel-deployment` skill. Local development token should reach **same-project Preview** by default; do not change Trusted Sources for that case. Do **not** print or commit `VERCEL_OIDC_TOKEN`.

Willy (or box handoff) next steps:

1. On the agent box: `vercel login` (device/browser approval as Willy / ynwaforever).
2. From `/workspace/hkwtia`: `vercel link --yes --scope ynwaforevers-projects --project hkwtia` (creates gitignored `.vercel/project.json`).
3. HTTP smoke (never log the token):
   ```bash
   vc curl https://hkwtia-l4eh06gmt-ynwaforevers-projects.vercel.app/ -I
   # or path form after link:
   vc curl / --deployment hkwtia-l4eh06gmt-ynwaforevers-projects.vercel.app -I
   ```
   Expect application headers/HTML (WiseTech / membership), **not** a 302 to `vercel.com/sso-api`.
4. Browser automation with origin-scoped header (agent-browser / Playwright extra headers):
   ```bash
   vc env run -- sh -c \
     'test -n "$VERCEL_OIDC_TOKEN" && agent-browser open "$1" --headers "{\"x-vercel-trusted-oidc-idp-token\":\"$VERCEL_OIDC_TOKEN\"}"' \
     sh https://hkwtia-l4eh06gmt-ynwaforevers-projects.vercel.app/
   ```
   Header name is exactly `x-vercel-trusted-oidc-idp-token` (not `x-vercel-oidc-token`).
5. If response is `TRUSTED_SOURCES_ENVIRONMENT_MISMATCH` for **Preview**, stop and report — default same-project Preview should not need a Trusted Sources edit. For protected **Production** deployment URLs only, Willy would authorize `development` → `production` in Settings → Deployment Protection → Trusted Sources (out of scope for Preview UAT).

### 2. Existing share-session harness (no Protection disable)

Repo already ships `scripts/vercel-preview-session.mjs`:

1. In Vercel dashboard → this Preview deployment → **Share** → copy HTTPS share URL containing `_vercel_share=…` (Preview host only; production alias forbidden by the script).
2. `VERCEL_SHARE_URL='…' node scripts/vercel-preview-session.mjs` → ignored `.playwright/preview-state.json` + `preview-cookie.txt` (JWT only; no app session cookies).
3. Playwright: `PLAYWRIGHT_BASE_URL=<preview origin> PLAYWRIGHT_STORAGE_STATE=.playwright/preview-state.json …`
4. Never commit share URL, JWT, or `.playwright/`.

### 3. Automation bypass secret (last resort; Willy-authorized only)

`update_project_protection_bypass` / `VERCEL_AUTOMATION_BYPASS_SECRET` + `x-vercel-protection-bypass` header. Do **not** generate from agents without an explicit Willy yes. Prefer paths 1–2. Never weaken production protection to satisfy Preview UAT.

## Actionable now vs needs Willy

| Actionable without Willy | Needs Willy |
| --- | --- |
| Document SSO/OIDC/share/CI/Stripe status (this file) | ~~`vercel login` on the box~~ **done 2026-10-27** (Preview OIDC/`vc curl` proven) |
| Keep `stacked-ci-trigger.patch` prepared and unapplied | Fix GitHub Actions billing/spending limit on the org/account |
| Local anonymous/LHCI already recorded; contrast fixed | Supply Stripe **test** price IDs into local acceptance (Preview catalog now verified four-tier) |
| Production Auth A/B/staff Google evidence already on PR | Magic-link A + staff confirmation; staff-D fixture role; zero-write DB readback; screen reader |
| | T-MP08 materials, T-MP10 legal, T-MP12 contracts |
| | Any production promote/deploy of PR #212 (not requested) |

## Recommended next concrete step

**Sign the box Vercel CLI in as Willy (`vercel login` + `vercel link` to `hkwtia`), then run the preferred `vc curl` smoke against `https://hkwtia-l4eh06gmt-ynwaforevers-projects.vercel.app/`.** If that returns the app (not SSO), record the procedure result here and run a minimal anonymous Preview fetch (home + `/membership` headings) for UC22-01/03 exact-head evidence. In parallel, clear GitHub Actions billing so #211 CI can run before anyone applies `stacked-ci-trigger.patch`.

## Preview OIDC proven — 2026-10-27

Recorded ~01:55 Asia/Hong_Kong on PR #212 at HEAD `b10686e3`. Supersedes "CLI logged out" above. Deployment Protection **unchanged** (SSO still on, no bypass secret, no Trusted Sources edit). No production deploy, no `stacked-ci-trigger.patch` application, no writes.

| Fact | Value |
| --- | --- |
| Box CLI | Vercel CLI 65.2.0, logged in as `ynwaforever`, `.vercel/project.json` linked to `ynwaforevers-projects/hkwtia` (gitignored) |
| Dev OIDC token | `VERCEL_OIDC_TOKEN` present in gitignored `.env.local` (from `vc env pull`); loaded via `vercel env run --`; **never printed/committed** |
| Target | PR #212 Preview `dpl_9aTJMDmyZLdEzmwPHfC3GxKdHdqC` → `https://hkwtia-gv0jvfuis-ynwaforevers-projects.vercel.app`, commit `b10686e3` (exact branch head at probe time) |
| Raw unauthenticated GET `/` | **302** → `vercel.com/sso-api` (wall still on) |
| `vercel curl / --deployment <url>` | **200**, app HTML (WiseTech, "Find your route"), `dpl_9aTJ…` in HTML |

### Anonymous `vercel curl` probes (same deployment)

| Path | Status | Notes |
| --- | --- | --- |
| `/` | 200 | Home HTML |
| `/en` | 307 → `/` | Default-locale prefix stripped (expected) |
| `/membership` | 200 | `x-matched-path: /[locale]/membership`; `.plan-grid` has **4** `article` ids: `community`, `startup`, `corporate`, `patron` |
| `/zh/membership` | 200 | Same four ids, ZH copy (社群/初創/企業/贊助人) |
| `/en/membership` | 307 → `/membership` | Expected |
| `/membership/join` | 404 | Not a route (join is per-tier CTA) — informational |
| `/robots.txt` | 200 | |
| `/sitemap.xml` | **500** | **Finding**: production `https://hkwtia.vercel.app/sitemap.xml` returns 200. Preview-only failure (likely Preview env/runtime data); not investigated here |
| Health endpoint | n/a | App has no public `/api/health`; nearest are cron/job routes (not anonymous) |

**Stripe paid tiers on Preview: YES.** Startup shows HK$2,400 / year, HK$250 / month, 5 seats; Corporate HK$12,000 / year, HK$1,200 / month, 25 seats; Patron "Contact us"; Community Free. The anonymous suite's four-tier assertion (`.plan-grid article` ids = community, startup, corporate, patron) would hold on Preview — the local red is purely the deliberately absent price IDs in `.env.acceptance.local`. Checkout itself (Stripe **test** secret/webhook) is still unverified.

### Browser path (Playwright, origin-scoped header) — proven

New read-only helper `scripts/preview-oidc-anon-check.mjs`: refuses non-`*.vercel.app` hosts and the production alias, attaches `x-vercel-trusted-oidc-idp-token` **only** to same-origin requests (third-party fonts/Stripe never see it), never logs the token.

```bash
cd /workspace/hkwtia
vercel env run -- node scripts/preview-oidc-anon-check.mjs https://hkwtia-gv0jvfuis-ynwaforevers-projects.vercel.app
```

Result (exit 0): `/` 200 h1 "How can Hong Kong lead the AI+ era?"; `/membership` 200 h1 "Choose the membership that fits your needs", planCards `[community, startup, corporate, patron]`; `/zh/membership` 200 h1 "選擇適合你的會籍", same four. All landed on the Preview origin (no SSO bounce).

### Still open

- **computerUse / desktop Chrome on the box has no header injection**, so interactive Auth UAT on Preview (Google / magic-link) still hits SSO in that browser. Options: (a) drive Auth via Playwright with the same origin-scoped route header (Google OAuth leaves the origin; header only needed on the Preview host, Neon Auth callback returns to it); (b) a header-injection extension in the box Chrome; (c) Willy-authorized share URL (`scripts/vercel-preview-session.mjs`). Do not disable SSO.
- Full `tests/e2e/hkwtia-anonymous-acceptance.spec.ts` on Preview: `playwright.config.ts` has no extra-header hook. Running it needs a tiny opt-in fixture that adds the same origin-scoped `context.route` when `VERCEL_OIDC_TOKEN` + `PLAYWRIGHT_BASE_URL` (Preview) are set — not added this slice.
- Preview `/sitemap.xml` 500.
- Stripe test checkout/webhook (UC22-15/20/37/38/40); Actions billing (UC22-59).

Inventory: **0 PASS / 49 PARTIAL / 11 BLOCKED / 0 NOT RUN** (unchanged; UC22-01/03 gain `previewOidcEvidence`, UC22-01 blocker reworded).

## Preview OIDC Playwright fixture + sitemap diagnosis — 2026-10-27

Recorded ~02:05 Asia/Hong_Kong on PR #212, continuing from `6cae5603`. Deployment Protection **unchanged**; no bypass, no production deploy, no `stacked-ci-trigger.patch`, no DB writes. Token never printed or committed (grep of `test-results/` and git tree for the token value: clean).

### Fixture (opt-in)

- `tests/fixtures/preview-oidc.ts` — drop-in `test`/`expect`. No-op unless `PLAYWRIGHT_PREVIEW_OIDC=true`; then requires `PLAYWRIGHT_BASE_URL` = HTTPS one-label `*.vercel.app` (refuses `hkwtia.vercel.app` → `PREVIEW_OIDC_PRODUCTION_TARGET_FORBIDDEN`) and `VERCEL_OIDC_TOKEN` (via `vercel env run --`). Errors are fixed codes; the token never appears in them.
- **Mechanism: Chromium CDP `Fetch` scoped to `<preview-origin>/*`, not `context.route`.** Verified on the box: Playwright routes only the first hop of a redirect chain, so `route.continue({headers})` re-applies the header to every later hop (a Preview 302 to Google OAuth / Stripe would carry the token), while `route.fetch`+`fulfill` drops it on same-origin hops (`/en` → `/` would bounce to SSO). CDP pauses each hop separately and its header override does not extend to redirects, so exactly the Preview-origin hops get the header.
- `tests/e2e/preview-oidc-header-scope.spec.ts` — hermetic (two loopback servers): header present on Preview same-origin redirect hop + subresource, absent on third-party subresource, off-origin redirect, and off-origin hop of a round-trip; present again on the return hop. **1 passed.**
- `tests/unit/preview-oidc-fixture.test.ts` — host/opt-in/token rules (11 passed). `playwright.config.ts` turns traces off when `PLAYWRIGHT_PREVIEW_OIDC=true` (pinned in the two existing config contract tests).
- `scripts/preview-oidc-anon-check.mjs` switched to the same CDP mechanism (it previously used `route.continue({headers})`; its three paths never redirected off-origin, so no exposure occurred).

### Minimal anonymous smoke on Preview — PASS

Target: PR #212 Preview `dpl_HPvtueKUWn76eBgLRtYY81dKJ4hX` → `https://hkwtia-43pniorq6-ynwaforevers-projects.vercel.app`, commit `6cae5603` (exact branch head at run time; Vercel `githubCommitSha` confirmed).

```bash
PLAYWRIGHT_PREVIEW_OIDC=true PLAYWRIGHT_BASE_URL=https://hkwtia-43pniorq6-ynwaforevers-projects.vercel.app \
  vercel env run -- npx playwright test tests/e2e/preview-oidc-anonymous-smoke.spec.ts
```

| Test | Result |
| --- | --- |
| `/` 200, stays on Preview origin, `lang=en`, one `h1` | pass |
| `/membership` 200, one `h1`, `.plan-grid article` ids = community, startup, corporate, patron | pass |
| `/zh/membership` 200, same four ids | pass |

3 passed (6.4s). Negative: same command with `hkwtia.vercel.app` → `PREVIEW_OIDC_PRODUCTION_TARGET_FORBIDDEN`; without the opt-in flag → 3 skipped. Re-ran `scripts/preview-oidc-anon-check.mjs` on the same deployment: exit 0, same h1s and four tiers.

### Preview `/sitemap.xml` 500 — diagnosed, not fixed (environment, not code)

`vercel curl /sitemap.xml` on both `dpl_9aTJ…` (b10686e3) and `dpl_HPvt…` (6cae5603): **500**, empty body. `vercel logs --deployment` shows `app/sitemap.ts` DB reads failing on the **Preview database schema**:

- `relation "posts" does not exist` (42P01) from `listPublishedNews("en"|"zh-HK")` — `posts` arrives in `drizzle/0012_m4b_scheduled_agents.sql`.
- `column events.status does not exist` (42703) from `eventsRepository.listPublicSlugs()` — added by `drizzle/0026_phase_b_events_two_sided.sql`.

So the Preview `DATABASE_URL` points at a database whose migrations lag far behind the branch (`npm run build` does not migrate; `db:migrate` is manual). `sitemap.ts` deliberately fails rather than publish a partial sitemap, so the 500 is correct behaviour for that DB; production (migrated DB) returns 200. **Not fixed here**: the fix is running `npm run db:migrate` against the Preview database (or pointing Preview at a migrated Neon branch) — a write to shared infrastructure that needs Willy's go-ahead. Implication: any Preview page reading `posts`/new `events` columns (news, events, sitemap) will also 500 on Preview, and Auth/portal on Preview may hit the same schema gap — migrate before Auth-on-Preview.

### Next Auth-on-Preview step

1. Willy authorizes migrating the Preview database (or re-pointing Preview `DATABASE_URL` to a migrated, non-production Neon branch); re-check `/sitemap.xml` → 200.
2. Write an opt-in `preview-oidc` Auth spec (import `test` from `tests/fixtures/preview-oidc.ts`): member magic-link request on `/member-login` → Willy pastes the link (or Gmail read) → assert `/portal` session sticks; Google OAuth hops leave the origin header-free by construction. Confirm Neon Auth trusted origins include the Preview host first (callback must return to the Preview origin).

## Preview database migrated — 2026-10-27

Willy confirmed (2026-10-27) that Neon project `hkwtia-m2-preview` branch `main` is **not production** (the Neon "vercel production branch" flag on it is the Vercel integration's label only) and authorized migrating it with the direct (non-pooler) URL.

| Item | Value |
| --- | --- |
| Env source | `vercel env pull --environment=preview --git-branch=wtia/hkwtia-plan-r1-20261025` to a 0600 temp file outside the repo (deleted after use). Production env not pulled. |
| Target | `DATABASE_URL_UNPOOLED` (= `POSTGRES_URL_NON_POOLING`) → host `ep-summer-dream-azxaax7t.c-3.ap-southeast-1.aws.neon.tech`, db `neondb`. Neon readback: project `hkwtia-m2-preview` (`solitary-wave-52860119`), branch `main` (`br-dark-forest-az0shpz9`), read-write endpoint `ep-summer-dream-azxaax7t`. Credentials never printed or committed. |
| Transport | Box egress to `:5432` is blocked, so the same Drizzle journal/SQL as `npm run db:migrate` (`drizzle-kit migrate`) was applied with `drizzle-orm/neon-serverless/migrator` over Neon's TLS WebSocket (`:443`) — the mechanism of `scripts/acceptance/migrate.ts`, pointed at the Preview URL with a hard host guard. Throwaway runner, not committed. |
| Before | `drizzle.__drizzle_migrations` 6 rows (last `0006_m2_integrity_indexes`, `when` 1784735440899 = journal idx 6); `public.posts` absent; `events.status` absent; 20 public tables |
| Applied | `0007_m3_automations` … `0067_owned_application_paging` (61 migrations), ~02:25–02:28 HKT, single run, no errors |
| After | 67 rows (last `when` 1792996785920 = journal `0067`); `posts` present; `events.status` present; 75 public tables |

### Verification (`vercel curl --deployment`, Deployment Protection unchanged)

Latest PR #212 Preview `dpl_3AMTCMw4e2NSegZA5VwwPjLCgpex` → `https://hkwtia-8cjq4mq09-ynwaforevers-projects.vercel.app` (alias `hkwtia-git-wtia-hkwtia-plan-r1-20261025-ynwaforevers-projects.vercel.app`), Vercel `githubCommitSha` `a634bab1` (exact branch head at run time):

| Path | Result |
| --- | --- |
| `/sitemap.xml` | **200** (was 500), 152 `<url>` entries |
| `/membership` | 200, plan ids `community`, `startup`, `corporate`, `patron` |
| `/zh/membership` | 200 |
| `/news`, `/events` | 200 (previously at risk from the same schema gap) |

Production (`hkwtia.vercel.app`, its Neon project/env) untouched. No deploy, no SSO change, no `stacked-ci-trigger.patch`. The Preview DB now has the full schema but only whatever data it held before (no seed run).

### Remaining Auth-on-Preview blockers

- **Neon Auth trusted origins (read-only check).** Preview's `NEON_AUTH_BASE_URL` is the Neon Auth of the same Preview branch (`ep-summer-dream-azxaax7t.neonauth…/neondb/auth`). Its trusted domains are only `https://hkwtia-fyyvbi4e3-ynwaforevers-projects.vercel.app` (an old immutable deployment) and `https://hkwtia-ynwaforever-ynwaforevers-projects.vercel.app`. Neither the PR #212 branch alias nor the current deployment URL is trusted, so Google/magic-link callbacks on the PR Preview are expected to fail origin checks. Fixed with Willy's approval — see [Preview Neon Auth trusted origin added](#preview-neon-auth-trusted-origin-added--2026-10-27).
- **`NEXT_PUBLIC_SITE_URL` on Preview is `https://hkwtia.vercel.app/`** — any absolute callback/redirect built from it would send a Preview sign-in back to production; check the login callback path before relying on Preview Auth.
- **Accounts:** the Preview Auth user directory is separate from production; Member A/B/staff must exist (or be created) there for a Preview Auth walk.
- Box desktop Chrome still lacks OIDC header injection — drive Preview Auth via the `tests/fixtures/preview-oidc.ts` Playwright fixture.

## Preview Neon Auth trusted origin added — 2026-10-27

Approved by Willy (Preview DB `hkwtia-m2-preview` / `main` confirmed not production). Change made via Neon MCP `add_auth_trusted_domain` (`auth_provider: better_auth`); no domain removed, no other Auth config touched.

| Item | Value |
| --- | --- |
| Neon project | `hkwtia-m2-preview` (`solitary-wave-52860119`, org Vercel `ynwaforever's projects`) |
| Branch | `main` (`br-dark-forest-az0shpz9`; Vercel-integration "production" branch of the **Preview** project) |
| Before | `https://hkwtia-fyyvbi4e3-ynwaforevers-projects.vercel.app`, `https://hkwtia-ynwaforever-ynwaforevers-projects.vercel.app` |
| Added | `https://hkwtia-git-wtia-hkwtia-plan-r1-20261025-ynwaforevers-projects.vercel.app` (stable PR #212 branch alias) |
| After (re-listed) | the two above **+** the PR #212 branch alias — 3 domains, all `better_auth` |

Per-deployment hosts (`hkwtia-<hash>-…`) were **not** added: they change on every push, and the stable alias is the one to test on.

### Remaining Auth-on-Preview gaps

- **`APP_URL` on Preview (branch `wtia/hkwtia-plan-r1-20261025`) is `https://hkwtia-ynwaforever-ynwaforevers-projects.vercel.app`**, not the PR #212 alias. Magic-link `callbackURL` is built from `appEnv().appUrl` (`app/[locale]/member-login/actions.ts`, join, seat invites), so a magic link requested on the PR alias will land on the `hkwtia-ynwaforever-…` host (a different deployment, and its own cookie origin). Needs a branch-scoped Preview `APP_URL` override = the PR #212 alias (env change; needs approval) before a Preview magic-link walk is meaningful.
- **`NEXT_PUBLIC_SITE_URL` on Preview is `https://hkwtia.vercel.app`** — used by `lib/urls.ts` and `metadataBase`; any absolute link built from it points at production. Same branch-scoped override would fix it.
- **Accounts:** the Preview Auth user directory is separate from production; Member A/B/staff must exist (or be created) there.
- **Browser:** box desktop Chrome lacks OIDC header injection; drive Preview login through `tests/fixtures/preview-oidc.ts` (Google OAuth hops leave the origin header-free by construction, but the return hop to the Preview origin needs the header — the CDP fixture handles that).


## Preview APP_URL / NEXT_PUBLIC_SITE_URL pinned to PR #212 alias — 2026-10-27

Approved by Willy. Change made with Vercel CLI 65.2.0 (`ynwaforever`, linked `ynwaforevers-projects/hkwtia`) as **branch-scoped Preview** variables — `vercel env add <NAME> -e preview --git-branch=wtia/hkwtia-plan-r1-20261025 --type config --value <alias> --yes`. No existing variable was edited or removed; global Preview, other branch overrides, Production and all `DATABASE_*` untouched.

| Variable | Scope | Before (effective for branch, inherited from global Preview) | After |
| --- | --- | --- | --- |
| `APP_URL` | Preview (`wtia/hkwtia-plan-r1-20261025`), Config | `https://hkwtia-ynwaforever-ynwaforevers-projects.vercel.app` | `https://hkwtia-git-wtia-hkwtia-plan-r1-20261025-ynwaforevers-projects.vercel.app` |
| `NEXT_PUBLIC_SITE_URL` | Preview (`wtia/hkwtia-plan-r1-20261025`), Config | `https://hkwtia.vercel.app` | `https://hkwtia-git-wtia-hkwtia-plan-r1-20261025-ynwaforevers-projects.vercel.app` |

Read-back via `vercel env pull` (values are public URLs; nothing else printed):

- Branch `wtia/hkwtia-plan-r1-20261025` Preview: both = PR #212 alias.
- Global Preview (other branches): unchanged — `APP_URL` `https://hkwtia-ynwaforever-…`, `NEXT_PUBLIC_SITE_URL` `https://hkwtia.vercel.app`.
- Production: unchanged — both `https://hkwtia.vercel.app`; `DATABASE_*` hash identical before/after.

### Redeploy

`vercel redeploy` of the latest branch Preview `hkwtia-hhpad6ybq-…` (`dpl_6U8WRYXfLnsqSt69nXMq4nem2DDZ`, commit `04273b69`) → **`dpl_AwY4mismW3emRjKGS7EE8d4mSxhy`** (`https://hkwtia-n5xyn93r1-ynwaforevers-projects.vercel.app`), target `preview`, Ready (~3 min). Stable alias `https://hkwtia-git-wtia-hkwtia-plan-r1-20261025-ynwaforevers-projects.vercel.app` serves it (132 × `dpl_AwY4…` in home HTML). No production deploy.

### Verification (`vercel curl --deployment <alias>`, Deployment Protection unchanged)

| Path | HTTP | Absolute links |
| --- | --- | --- |
| `/` | 200 | canonical, `og:url`, `og:image`, `hreflang` en/zh-HK/x-default all on the PR alias; **0** `https://hkwtia.vercel.app` references, 20 alias references |
| `/sitemap.xml` | 200 | 608 alias references, 0 production |
| `/robots.txt` | 200 | sitemap line on alias, 0 production |
| `/member-login`, `/admin-login` | 200 | no absolute site URLs in HTML (callback URL is built server-side from `APP_URL` at submit time) |

How to re-check: `vercel curl / --deployment https://hkwtia-git-wtia-hkwtia-plan-r1-20261025-ynwaforevers-projects.vercel.app -- -s | grep -oE '<link rel="canonical"[^>]*>|https://hkwtia\.vercel\.app'`.

Neon Auth trusted domains on `hkwtia-m2-preview` / `main` (`br-dark-forest-az0shpz9`, read-only re-list via Neon MCP): still 3 — `hkwtia-fyyvbi4e3-…`, `hkwtia-ynwaforever-…`, and the PR #212 alias — all `better_auth`.

Note: any later push to `wtia/hkwtia-plan-r1-20261025` (including this docs commit) builds with the branch-scoped values automatically.

### Remaining Auth-on-Preview gaps

- **Accounts:** Preview Neon Auth has its own user directory, separate from production; Member A/B/staff (and staff D) must exist or be created on Preview before a Preview Auth walk. Not checked/changed in this slice.
- **Magic-link delivery on Preview** (email provider env on Preview) not yet exercised; first real `APP_URL`-based callback still to be observed end-to-end.
- **Browser:** box desktop Chrome lacks OIDC header injection; drive Preview login through `tests/fixtures/preview-oidc.ts`. Google OAuth return to the alias must be confirmed against the Google client's allowed redirect URIs (Neon Auth-managed vs custom client — unverified).

## Auth on Preview — accounts + Member magic-link send (2026-10-27 HKT)

Target: PR #212 alias `https://hkwtia-git-wtia-hkwtia-plan-r1-20261025-ynwaforevers-projects.vercel.app` → `dpl_3h5g6U1BQW6RALJcqAo1FDsAJdXf` (target `preview`, created 02:47 HKT, branch build after `6876d1b1`). Database/Auth: Neon `hkwtia-m2-preview` / `main` (`br-dark-forest-az0shpz9`). Read-only SQL; no Neon, Vercel env or Production change in this slice. Emails are not recorded (masked form only).

### Preview accounts (read-only `neon_auth."user"` + `public.profiles`)

| Account | Preview `neon_auth` user | Preview `profiles` row | Note |
| --- | --- | --- | --- |
| Member A (gmail.com) | **unconfirmed** — one non-fixture user exists, `l***@gmail.com`, verified, created 2026-09-25; same masked shape as A's production recipient (`l***@g***.com`) but identity vs A/staff not proven | none for that user | |
| Member B (Fimmick) | **absent** | none | |
| Staff (gmail.com) | **unconfirmed** (see A row; staff is also gmail.com) | none | Preview staff profiles are fixtures only (`m2-staff-01`, `m2-superadmin-01`, `m2-exco-01`) |
| Other | 27 M2 fixture users `m***@example.com` (unverified) | 28 fixture profiles `*@m2.example.test` | |

No users were created. Not needed for magic link: Preview Neon Auth config has sign-up allowed, so `auth.signIn.magicLink` creates the user on first verify, and `provisionMemberProfileAction` creates the member profile from the verified session. `create_auth_user` would need the plaintext address in the call, which vault fill references cannot supply. **Beyond Auth:** Preview has no membership/company rows for A/B (production A = Corporate PAYMENT PENDING), so a Preview `/portal` for A shows a member with no membership — enough for the session/verifier check, not for membership walks. Staff `/admin` on Preview needs a staff/superadmin `profiles.role` for the real staff `auth_user_id` (seed or manual grant after first login).

### Magic-link send — BLOCKED: `limiter_unavailable`

New opt-in spec `tests/e2e/preview-oidc-member-magic-link.spec.ts` (same OIDC fixture; one page does send → wait for link → open → `/portal` sticky, so the verifier exchange runs in the context that requested the link). Clears `hkwtia-login-*` sessionStorage first, types with real keystrokes, asserts `?sent=1`.

```bash
PLAYWRIGHT_PREVIEW_OIDC=true PLAYWRIGHT_BASE_URL=https://hkwtia-git-wtia-hkwtia-plan-r1-20261025-ynwaforevers-projects.vercel.app \
PREVIEW_LOGIN_EMAIL_FILE=/tmp/<0600 file>   # or PREVIEW_LOGIN_HANDOFF=true (headed; a person types the email and clicks Send)
PREVIEW_MAGIC_LINK_FILE=/tmp/<file the pasted link is written to> \
  vercel env run -- npx playwright test tests/e2e/preview-oidc-member-magic-link.spec.ts
```

Run 02:55 HKT (Member B address as the pipeline probe — the only inbox readable here; A's address is vault-only): page 200 past Deployment Protection, field filled, submit → `/member-login?next=%2Fportal&error=limiter_unavailable`. **No email was sent.** Without opt-in the spec skips (1 skipped).

Cause: `checkAuthSend` → `rateLimitKeyHash` throws `RATE_LIMIT_KEY_SECRET_REQUIRED` (fail-closed) because **`RATE_LIMIT_KEY_SECRET` is not set for Preview branch `wtia/hkwtia-plan-r1-20261025`** (`vercel env ls`: set for Production and several `codex/*` Preview branches only). Preview `rate_limit_buckets` already allows the `auth-send-*` scopes, so the DB is not the blocker.

Unblock (needs Willy's OK — Vercel env change): add a fresh random ≥32-byte `RATE_LIMIT_KEY_SECRET` for Preview branch `wtia/hkwtia-plan-r1-20261025` only (not copied from Production), redeploy that Preview, re-run the spec. Then Member A: Willy (or a vault-fill step) types A's email in the headed handoff window, A's Preview link is pasted into `PREVIEW_MAGIC_LINK_FILE` or that window's address bar; the spec asserts `/portal` with no `neon_auth_session_verifier` left and a sticky reload.

## Preview RATE_LIMIT_KEY_SECRET added — limiter unblocked (2026-10-27 HKT)

With Willy's approval: a **fresh** random secret (32 random bytes, hex-encoded, generated on the box; not copied from Production or any other branch; never printed or committed; temp file shredded) was added as `RATE_LIMIT_KEY_SECRET`, type **Secret**, scoped to **Preview, git branch `wtia/hkwtia-plan-r1-20261025` only** (`vercel env add … preview --git-branch=… --type secret`, value via stdin). Read-back `vercel env ls preview wtia/hkwtia-plan-r1-20261025`: `RATE_LIMIT_KEY_SECRET  Hidden  Secret  Preview (wtia/hkwtia-plan-r1-20261025)`. Production `RATE_LIMIT_KEY_SECRET` unchanged (created 28d ago). No Preview-wide value, no Neon Auth / SSO change.

Redeploy (Preview, no Production touch): `vercel redeploy` of `dpl_C2u3j8Vsvr9WTySMTPgDGD8REDd2` (branch build of `f0a82ca1`) → **`dpl_8Ro49iE2euShEhAkyxjFdq4oWfuj`** `https://hkwtia-5k0tlcz6j-ynwaforevers-projects.vercel.app`, target `preview`, **READY** 03:06 HKT; PR alias `https://hkwtia-git-wtia-hkwtia-plan-r1-20261025-ynwaforevers-projects.vercel.app` now points at it.

### Limiter / magic-link probe (Member B address, 03:10 HKT)

`tests/e2e/preview-oidc-member-magic-link.spec.ts` via the OIDC fixture on the PR alias, Member B's address (Willy's connected inbox; A's address stays vault-only and was not used):

| Step | Result |
| --- | --- |
| Send | **`?sent=1`** on the Preview origin — no `error=limiter_unavailable` / `RATE_LIMIT_KEY_SECRET_REQUIRED` |
| Delivery | Neon Auth email "Sign In to hkwtia-m2-preview" arrived in B's inbox (SendGrid click-wrapped link → `*.neonauth.*.neon.tech`, 5-minute expiry) |
| Open (same OIDC context) | Neon Auth verify succeeded; app returned to Preview `/member-login` showing "Your sign-in is verified. Create a member profile to continue…" |
| `/portal` assertion | Not reached (spec timeout at step 4) — **expected**: Preview has no `profiles` row for B; "Create member profile" was **not** clicked (no profile write) |

Side effect: Neon Auth on Preview (sign-up allowed) now has a verified user for Member B, created by B's own magic-link verify. No membership/profile rows written. Link/token/cookies not recorded.

Readiness: the Preview send path (limiter + email provider + callback to PR alias + verifier exchange) works. **Ready for the headed Member A handoff** (A types own address; A's Preview has no profile either unless one exists for the unconfirmed `l***@gmail.com` user, so expect the same "Create member profile" state rather than `/portal`). Spec note: step 4 should also accept the verified-no-profile state, or the run should create the profile first.

## Member A headed Preview handoff (2026-10-27 HKT) — PASS (needs-profile)

Spec `0498d94e`: step 4 now accepts either sticky `/portal` (no `neon_auth_session_verifier`, reload stays on `/portal`) or the verified "needs-profile" state (`profile-provision-form` visible on `/member-login`, still shown after a fresh `/member-login` load, signed-out email field absent). The provision form is never submitted by the spec. Step 3 also detects an address-bar paste that lands on the create-profile screen.

Preview: PR alias → `dpl_ABbWNxaAmyQJ5kV1ovnzDZbQuCbo` (build of `0498d94e`, READY); `RATE_LIMIT_KEY_SECRET` present for Preview branch `wtia/hkwtia-plan-r1-20261025` only.

Headed run started 03:22 HKT on box display `:6` (`PREVIEW_LOGIN_HANDOFF=true`, `PREVIEW_MAGIC_LINK_FILE=/tmp/hkwtia-preview-magic-link`, link wait 15 min, send wait 15 min). Willy typed Member A's address (vault-only) and clicked Send, then opened the Preview magic link from Gmail.

| Step | Result |
| --- | --- |
| Send | `?sent=1` on the Preview origin (run log `[send]`); no `limiter_unavailable` |
| Open | Preview `/member-login?next=/portal` shows "Your sign-in is verified. Create a member profile…" with **Create member profile** (needs-profile state; A has no Preview profile). Not `/portal` — `/portal` not claimed |
| Sticky | Confirmed by a separate desktop check on the same Playwright Preview Chromium (~03:34 HKT): fresh load of `/member-login` on the PR alias still shows the verified create-profile UI, no email input |

Playwright auto-assert did **not** finish: the link was pasted into a second tab, while the spec's `page` stayed on `?sent=1`, so `[open]`/`[sticky]` were never logged. At 03:34 HKT the stuck handoff tree (`/tmp/hkwtia-handoff/run.sh`, PID 1141875 → `vercel env run` → `playwright test` → Chromium) was killed with SIGTERM rather than left to its 15-minute link wait; no `EXIT=` line. Open/sticky evidence above is visual, not spec-asserted.

**Create member profile was NOT clicked** (no profile write approved); no profile or membership rows created. Neon Auth on Preview now holds a verified user for Member A (from A's own verify). No email, link, token or cookie recorded. Production, Neon config and Vercel env unchanged.

Result: **PASS (needs-profile)** for Member A Preview magic-link send → verify → sticky verified state. Not a `/portal` session; spec auto-assert run still to repeat (paste into the spec's own tab or via `PREVIEW_MAGIC_LINK_FILE`).

## Staff Preview Auth — profile grant + spec, ready for headed handoff (2026-10-27 HKT)

Recorded ~04:00 Asia/Hong_Kong on PR #212 (continuing from `5cee1735`). Scope: Preview Neon `hkwtia-m2-preview` (`solitary-wave-52860119`) / `main` (`br-dark-forest-az0shpz9`) only. No Vercel env, SSO, Neon Auth config or Production change. No email address, link, token or cookie recorded.

### Code path (read first)

- `/admin-login` (`app/[locale]/admin-login/page.tsx`) → `resolveCurrentLogin({intent: "admin"})` → `lib/auth/login-resolution.ts`: signed-in subject → `profiles` row by `auth_user_id`; **no row → "needs-profile"** ("Staff account needs review", link to member sign-in); `role ∈ {staff, exco, superadmin}` → redirect to `/admin`; `member` → AccessDenied. `provisionMemberProfileAction` only ever creates `role=member`, and there is no in-app role-grant UI, so a staff profile on a fresh DB must be seeded (as on Production).
- Magic link: `requestAdminLoginLink` → limiter → `auth.signIn.magicLink` with callback from `APP_URL` (PR alias) — same pipeline proven for members.
- **Google is off on Preview**: `/admin-login` on the alias renders "Google sign-in will be available after provider setup is verified." (`AUTH_GOOGLE_ENABLED` not `true` for this branch). Neon Auth on Preview has a `google` (shared) provider, but enabling the button is a Vercel env change — not made. Staff Preview path = **magic link**.

### Identifying the real staff Auth user without plaintext (read-only)

Preview `neon_auth."user"` non-fixture rows (masked): `894b2e40-…` `l***@gmail.com`, verified, provider `google`, created 2026-09-25 (earlier Preview Google sign-in), no profile; `38259cd6-…` Member B (`w***@fimmick.com`, from B's magic link); `03f1f159-…` Member A (`l***@gmail.com`, from A's magic link 03:31 HKT). Matching was done by comparing `md5(lower(email))` of the Preview users with the single Production `profiles` row with role `superadmin` (**read-only `SELECT`** on Production `fragrant-mountain-25240574`; hashes only, nothing written): **exactly one match — `894b2e40-…`**. Member A is a different user (different hash), so granting staff to `894b2e40-…` cannot touch A.

### Preview profile grant (write, Preview only)

Pre-checks: no Preview `profiles` row with that id, `auth_user_id` or email (0 clashes); no triggers on `profiles`; Preview role counts before: member 27, staff 1, exco 1, superadmin 1 (fixtures).

```sql
-- Preview hkwtia-m2-preview / main only. Email copied inside the DB from neon_auth, never printed.
insert into public.profiles (id, auth_user_id, email, role, display_name, locale)
select u.id::text, u.id::text, lower(u.email), 'superadmin', 'Willy Lai', 'en'
from neon_auth."user" u
where u.id = '894b2e40-2283-4c88-aa64-828ab71ae090' and u."emailVerified"
  and md5(lower(u.email)) = '<hash of the Production superadmin email>'
on conflict do nothing;
update public.profiles set onboarding_state = 'complete', locale = 'zh'
where id = '894b2e40-2283-4c88-aa64-828ab71ae090' and role = 'superadmin';
```

Result: 1 row, `role=superadmin`, `onboarding_state=complete`, `locale=zh` (mirrors the Production superadmin row's role/onboarding/locale, read-only), created 03:53 HKT. No membership, company, audit or Auth row touched. Rollback: `delete from public.profiles where id = '894b2e40-2283-4c88-aa64-828ab71ae090'` (Preview only; not run).

### Spec

`tests/e2e/preview-oidc-staff-magic-link.spec.ts` (opt-in, OIDC fixture): `/admin-login` clean jar → send (`PREVIEW_LOGIN_EMAIL_FILE` or headed `PREVIEW_LOGIN_HANDOFF=true`) → `?sent=1` → wait for the link via `PREVIEW_MAGIC_LINK_FILE` **or any tab of the window** (fixes the member A second-tab stall) → assert landing `/admin` (fails with `NEEDS_PROFILE` on the recovery screen) → sticky `/admin` reload → `/portal` redirects to `/admin`. Read-only; no form/approval/queue action. `allowedMagicLink` moved to `tests/fixtures/preview-magic-link.ts` (shared with the member spec). Without opt-in: 2 skipped (member + staff). `tsc` + eslint clean.

### Status: READY FOR HANDOFF (superseded — PASS below)

Willy steps (headed, box display `:6`):

1. Agent starts `/tmp/hkwtia-handoff/run-staff.sh` (box-only helper; equivalent to the command below). Send window 15 min, link window 15 min.
   ```bash
   DISPLAY=:6 PLAYWRIGHT_PREVIEW_OIDC=true PLAYWRIGHT_BASE_URL=https://hkwtia-git-wtia-hkwtia-plan-r1-20261025-ynwaforevers-projects.vercel.app \
   PREVIEW_LOGIN_HANDOFF=true PREVIEW_MAGIC_LINK_FILE=/tmp/hkwtia-preview-staff-magic-link PREVIEW_MAGIC_LINK_WAIT_MS=900000 \
     vercel env run -- npx playwright test tests/e2e/preview-oidc-staff-magic-link.spec.ts --reporter=list --workers=1
   ```
2. In the Playwright Chromium on `/admin-login`, Willy types the **staff (Superadmin) Google address** (vault login 1083647) and clicks Send.
3. Willy opens the "Sign In to hkwtia-m2-preview" email in the staff inbox and pastes the link into the **same Playwright window** (address bar or a new tab) within 5 minutes.
4. Expect `[open] … (admin)`, `[sticky]`, `[separation]` and `EXIT=0`.

## Staff Preview magic-link — PASS (2026-10-27 HKT)

Headed handoff on box display `:6`, run ~04:02–04:07 Asia/Hong_Kong (spec runtime 4.7 min), against the PR #212 branch alias, which served Preview **`dpl_7hfjp2cBTot72M7KYLkfPhY8XUkW`** (`hkwtia-p31qrc7d4-…`, commit **`2435152d`** = branch head at run time, READY 03:55 HKT). Spec `tests/e2e/preview-oidc-staff-magic-link.spec.ts` via the OIDC fixture (`x-vercel-trusted-oidc-idp-token` scoped to the Preview origin; Deployment Protection unchanged). Willy typed the staff address and pasted the link; the agent never saw or recorded the address, link, token or cookie.

| Step | Result |
| --- | --- |
| `[send]` | `?sent=1` reached on `/admin-login` (Preview origin) — no `limiter_unavailable` |
| `[open]` | Magic link landed on **`/admin`** (role resolved to staff/admin; not the "needs-profile" recovery screen) |
| `[sticky]` | Reload of `/admin` stays on `/admin` |
| `[separation]` | `/portal` redirects a staff session to `/admin` |
| Result | **1 passed (4.7m), EXIT=0** |

**Status: PASS — Staff Preview magic-link Auth end-to-end** (send → verify → `/admin` session → sticky → portal/admin separation) on exact-head Preview `2435152d`. Actor: the Preview-only `superadmin` profile for Auth user `894b2e40-…` granted above. Read-only: no approval, queue, member, form or settings action; no DB write beyond the earlier profile grant.

Scope limits (not claimed):

- **Google still off on Preview** (`AUTH_GOOGLE_ENABLED` unset for this branch) — magic-link path only. Enabling Google on Preview is a Vercel env change needing Willy's approval.
- Superadmin, not the **staff D fixture role**; no staff write, zero-write NONSTAFF readback or `/admin` route walk on Preview.
- Preview only — Production unchanged and still on `main@3eb9992d`.

Inventory: status counts unchanged (**0 PASS / 49 PARTIAL / 11 BLOCKED / 0 NOT RUN**); UC22-11/13 blockers reworded and `previewAuthEvidence` added (see `t22-07-inventory.json`).

## Preview anonymous acceptance — PASS 15/15 (2026-10-27 HKT)

New opt-in spec `tests/e2e/preview-oidc-anonymous-acceptance.spec.ts` (OIDC fixture, origin-scoped header, traces/video off) mirrors the local `hkwtia-anonymous-acceptance.spec.ts` on Preview; helpers moved verbatim to `tests/fixtures/anon-acceptance-helpers.ts`. Omitted on Preview by design: concierge POST (provider call), local-DB directory preflight, and `APIRequestContext` HTTP-boundary probes (would not carry the header) — boundaries are checked in the browser instead, including `next=`.

| Run (HKT) | Preview | Result |
| --- | --- | --- |
| ~04:10 | PR alias, code = `2435152d`/`57c4540c` | **5 passed / 10 failed** — all 10 are one axe `color-contrast` (serious): `.open-now-record > span` "Most recent on the record" / "最近一次活動紀錄", `#8fc4e0` on `#1a4f82`, **4.48:1** (11px bold, needs 4.5). Every page other than home was clean. |
| ~04:20 | `dpl_7cA2U1EsfN5jNVxa5xbzrFrcygYq` (commit **`06ccd701`**) | **15 passed (2.7m), EXIT=0** |

Why local missed it: the Open Now record only renders when a published past item exists; the Preview DB (migrated, with content) has one, the local anonymous catalog did not.

Fix (`06ccd701`, test-first): `.open-now-record > span` → `#a8d4ec` (5.35:1), the cyan tint `wisetech-shell.css` already uses on this host for `.honest-empty .status-label`; `--xp-signal` untouched. `tests/unit/open-now-record-contrast.test.ts` failed before, passes after; related CSS/home units 150/150; `tsc` and eslint clean.

Coverage at 15/15: 8 public paths × EN/ZH × 375/768/1024/1440 (200, one visible h1, `main#main-content`, no horizontal overflow, skip link → `#main-content`, settled home CTA contrast, axe 0 serious/critical, Vercel toolbar excluded); `/membership` + `/zh/membership` four tiers, `#plans` anchor, FAQ, contact link; anonymous `/admin`, `/admin/members`, `/portal`, `/portal/company` (EN/ZH) → login with `next`; reduced-motion home axe EN/ZH; locale round-trip keeps query/hash.

Not claimed: screen reader, real devices, Lighthouse/RUM on Preview, production. UC22-01 stays PARTIAL pending review against the original checklist.

## Remaining R2 gates — who unblocks (2026-10-27 HKT)

| Gate | Needs | Notes |
| --- | --- | --- |
| Member A/B Preview membership walks (portal routes, UC22-21/22/23/29/30/35/36/39 on Preview) | ~~approve Preview member profiles~~ **Done 2026-10-27** ([seeded](#preview-member-profiles-for-ab--seeded-2026-10-27-hkt)). Now: **Willy** headed A/B magic-link handoff to browser-prove `/portal`; **Willy** decide Preview membership/company fixtures for the walks | Profiles only: `/portal` renders "no current membership"; no Preview membership/company/application rows |
| Google sign-in on Preview | **Willy**: approve setting `AUTH_GOOGLE_ENABLED=true` for the Preview branch | Not set; magic link is the only Preview path |
| Staff D fixture role / staff writes / zero-write NONSTAFF readback | **Willy**: approve a Preview `staff` (non-superadmin) profile and which writes to exercise | Superadmin magic-link PASS only |
| Local paid-tier catalog (local four-tier red) | **Willy**: Stripe *test* price IDs for local acceptance env | Preview/Production already show four tiers; do not invent IDs |
| Exact-head remote CI | **Willy**: fix GitHub Actions billing, then apply `stacked-ci-trigger.patch` | #211 zero-step failures; #212 no runs |
| UC22-01 PASS promotion | Reviewer / Willy: original Test_Cases.csv checklist | Preview 15/15 evidence above |
| Preview Lighthouse (UC22-57) | ~~None — agent can run~~ **Done 2026-10-27** ([lab pass](#preview-lighthouse-lab-uc22-57--2026-10-27-hkt)); field INP needs RUM (Willy: enable Vercel Speed Insights / RUM on Production or a real-traffic Preview) | Perf ≥0.94 / A11y 1.00 on 10/10; SEO 0.54 Preview-environment; mailto form mixed-content observation |

## Preview Lighthouse lab (UC22-57) — 2026-10-27 HKT

Read-only lab pass, run 04:22–04:27 Asia/Hong_Kong on PR #212 Preview **`dpl_7cA2U1EsfN5jNVxa5xbzrFrcygYq`** (`hkwtia-b4ufoywcd-…`, commit `06ccd701`; branch head `cbaca9b4` differs by docs only), the deployment the PR alias served. Manifest: [uc22-57-preview-lighthouse.json](uc22-57-preview-lighthouse.json).

**Harness.** `lhci collect --config=lighthouserc.js` was not used on Preview: its only protected-Preview path is `LHCI_COOKIE_FILE` (needs a share-link `_vercel_jwt`, i.e. a Willy-authorized share URL), and putting the OIDC token in Lighthouse `extraHeaders` would send it to third-party origins (Preview injects `vercel.live`) and copy it into every `lhr.configSettings`. New `scripts/preview-oidc-lighthouse.mjs` runs Lighthouse 12.6.1 (same version as LHCI) through its Node API on a puppeteer-core page, injecting `x-vercel-trusted-oidc-idp-token` per request via CDP Fetch scoped to the Preview origin (same mechanism as `tests/fixtures/preview-oidc.ts`). Same ten URLs and order as `lighthouserc.js`, **3 runs each / 30 reports**, default mobile simulated throttling (4× CPU, 150 ms RTT), medians. `extraHeaders` null in every LHR; token-string scan of all saved reports: **0 hits**. Raw LHRs stay under ignored `.playwright/lighthouse-preview*/`; nothing uploaded.

```bash
cd /workspace/hkwtia
vercel env run -- node scripts/preview-oidc-lighthouse.mjs https://hkwtia-b4ufoywcd-ynwaforevers-projects.vercel.app 3
```

| URL | Perf | A11y | Best pr. | SEO | LCP ms | CLS | TBT ms | FCP ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| / | 0.94 | 1.00 | 0.61 | 0.54 | 2344 | 0 | 74 | 1240 |
| /membership | 0.99 | 1.00 | 0.61 | 0.54 | 2109 | 0 | 39 | 1237 |
| /events | 0.96 | 1.00 | 0.61 | 0.54 | 2418 | 0 | 74 | 1235 |
| /programmes | 0.98 | 1.00 | 0.61 | 0.54 | 2277 | 0 | 93 | 1227 |
| /partners | 0.99 | 1.00 | 0.61 | 0.54 | 1957 | 0 | 66 | 1089 |
| /zh | 0.98 | 1.00 | 0.61 | 0.54 | 2247 | 0 | 111 | 1227 |
| /zh/membership | 0.99 | 1.00 | 0.61 | 0.54 | 2095 | 0 | 41 | 1228 |
| /zh/events | 0.98 | 1.00 | 0.61 | 0.54 | 2410 | 0 | 90 | 1231 |
| /zh/programmes | 0.98 | 1.00 | 0.61 | 0.54 | 2269 | 0 | 96 | 1223 |
| /zh/partners | 0.99 | 1.00 | 0.61 | 0.54 | 1891 | 0 | 76 | 1086 |

All 30 runs landed on the Preview origin (no SSO bounce), no runtime errors. Single-run range: performance 0.83–0.99 (one `/zh` cold first run 0.83; medians all ≥0.94).

Against the `lighthouserc.js` assertions (median): **performance ≥0.90 — met on 10/10; accessibility ≥0.95 — 1.00 on 10/10; SEO ≥0.95 — not met (0.54)**. Best-practices is not asserted by the config (0.61). Causes:

| Audit | Kind | Detail |
| --- | --- | --- |
| SEO `is-crawlable` | Environment | Preview sends `x-robots-tag: noindex` (Vercel Preview default) |
| SEO `robots-txt` | Harness artifact | Lighthouse fetches `/robots.txt` outside the page's request path, so the scoped header is absent and it gets SSO HTML; header-scoped curl of `/robots.txt` → 200 |
| SEO `canonical` | Host artifact | Canonical/hreflang use the branch alias; fails only on the immutable deployment URL. Alias spot-check (1 run, `/`, `/zh`, `/membership`): canonical passes, SEO 0.61 (only the two rows above remain) |
| BP `third-party-cookies` + cookie inspector issue | Environment | `vercel.live` feedback toolbar (Preview-only) sets `_vcrr_*` |
| BP `is-on-https` + mixed-content inspector issue | **Product observation** | Footer newsletter form's intentionally inert `action="mailto:contact@hkwtia.org"` (`components/layout/footer-newsletter.tsx`, blocked by CSP `form-action 'self'`) is reported by Chrome as mixed content "Allowed with warning" on HTTPS. Not visible on http localhost runs. **Not changed** — product/design decision (the comment explains why removing the action would leak the address) |

Compared with the local `next start` medians (LCP ~2.2–2.9 s), Preview lab LCP is **1.9–2.4 s**, CLS 0 everywhere, TBT 39–111 ms. Lab only, shared box host, one Vercel region (iad1) from Hong Kong. **Field INP (RUM) NOT_TESTED**; UC22-57 stays **PARTIAL**. Inventory counts unchanged: **0 PASS / 49 PARTIAL / 11 BLOCKED / 0 NOT RUN**.

No Production, Vercel env, Deployment Protection/SSO, Neon or Auth change; GETs to the Preview only.

## Preview member profiles for A/B — seeded (2026-10-27 HKT)

Approved by Willy (2026-10-27, "Create Preview member profiles for A/B so portal walks can run"). Recorded ~10:45 Asia/Hong_Kong on PR #212. Scope: Preview Neon `hkwtia-m2-preview` (`solitary-wave-52860119`) / `main` (`br-dark-forest-az0shpz9`) only, via Neon MCP `run_sql_transaction`. No Production, Vercel env, SSO/Deployment Protection, Neon Auth config, Stripe or CI change. No email address, link, token or cookie printed or recorded.

### Code path (read first)

`provisionMemberProfileAction` (`app/[locale]/member-login/provision-action.ts`) → `provisionVerifiedMember` (needs `emailVerified`) → `profileIdentityRepository.provisionMember` (`lib/db/repos/profile-identities.ts`): in one transaction, advisory lock on the email, return the existing row by `auth_user_id`, refuse on a same-email row (`conflict`), else insert **`{id: authUserId, auth_user_id: authUserId, email: lower(trim(email)), role: 'member', display_name: name.trim().slice(0,120) || 'WTIA member'}`** with every other column on its default. No membership, company, audit, notification or Auth side effect. So a SQL insert of the same columns is equivalent to clicking "Create member profile"; no headed click was needed. `sessionToActor` / `resolveLogin` then resolve role `member` from `profiles.auth_user_id` → `/portal` allowed.

### Pre-checks (read-only)

| Check | Result |
| --- | --- |
| Preview `neon_auth."user"` non-fixture rows | `894b2e40-…` (staff superadmin, already has its profile — untouched), `38259cd6-7080-407f-9c19-895770e23584` (Member B, `w***@fimmick.com`, verified, created 2026-10-27 03:12 HKT), `03f1f159-44d0-4e77-b92e-a8b603054ef8` (Member A, `l***@gmail.com`, verified, created 2026-10-27 03:31 HKT). Auth `name` blank for both A and B |
| Clashes for A/B (`profiles` by id, `auth_user_id` or lower(email)) | 0 / 0 |
| Triggers on `profiles` | 0 |
| Role counts before | member 27, staff 1, exco 1, superadmin 2 |

### Write (Preview only)

```sql
-- Preview hkwtia-m2-preview / main only. Mirrors provisionMember; email copied inside the DB, never printed.
insert into public.profiles (id, auth_user_id, email, role, display_name)
select u.id::text, u.id::text, lower(trim(u.email)), 'member',
       coalesce(nullif(left(trim(u.name),120),''),'WTIA member')
from neon_auth."user" u
where u.id in ('03f1f159-44d0-4e77-b92e-a8b603054ef8','38259cd6-7080-407f-9c19-895770e23584')
  and u."emailVerified"
  and not exists (select 1 from public.profiles p
                  where p.auth_user_id = u.id::text or p.id = u.id::text or lower(p.email) = lower(trim(u.email)))
on conflict do nothing;
```

Result: 2 rows, created 2026-10-27 10:43:46 HKT.

| Profile id (= Auth user id) | Actor | role | onboarding_state | locale | display_name |
| --- | --- | --- | --- | --- | --- |
| `03f1f159-44d0-4e77-b92e-a8b603054ef8` | Member A | member | profile (default) | en (default) | WTIA member |
| `38259cd6-7080-407f-9c19-895770e23584` | Member B | member | profile (default) | en (default) | WTIA member |

Rollback (Preview only; not run): `delete from public.profiles where id in ('03f1f159-44d0-4e77-b92e-a8b603054ef8','38259cd6-7080-407f-9c19-895770e23584') and role = 'member';`

### Verification

| Check | Result |
| --- | --- |
| Email on each row equals its `neon_auth` user's (compared in SQL, boolean only) | true / true; exactly 1 profile per address |
| App resolve query replayed read-only (`select id, role from profiles where auth_user_id = $1 limit 1`) | A → `{profileId: 03f1f159-…, role: member}`; B → `{profileId: 38259cd6-…, role: member}` ⇒ `resolveLogin` = allowed for `/portal`, no longer needs-profile |
| Role counts after | member 29, staff 1, exco 1, superadmin 2 (+2 member only) |
| Memberships / company links / applications for A and B on Preview | 0 / 0 / 0 |
| Live (unexpired) Neon Auth sessions | 1 each (from the 03:12/03:31 HKT verifies); their cookies lived only in the killed handoff browsers — not reused |

**Not yet browser-proven.** A real `/portal` session for A/B needs a fresh magic link to each inbox, which only Willy can open (addresses are vault-only and typed by Willy). DB-level: needs-profile is gone for both.

What `/portal` will show: `getDashboard` throws `MEMBERSHIP_INACTIVE` with no membership, so `/portal` renders 200 with "This account has no current membership" / 「此帳戶目前沒有可使用的會籍」 plus links to applications, profile, billing and sign-out — a member session, not a membership dashboard.

### Spec update — strict `/portal` + read-only route smoke

`tests/e2e/preview-oidc-member-magic-link.spec.ts`:
- Watches **every tab** of the handoff window for the link (fixes the Member A second-tab stall, same as the staff spec).
- `PREVIEW_EXPECT_PORTAL=true` → the verified create-profile screen fails with `NEEDS_PROFILE`; after `[sticky]` it logs `[dashboard]` (membership-unavailable vs membership dashboard) and GETs `/portal`, `/portal/applications`, `/portal/profile`, `/portal/company`, `/portal/company/seats`, `/portal/directory`, `/portal/events`, `/portal/events/my`, `/portal/documents`, `/portal/billing`, `/zh/portal` — asserting < 500, no bounce to `/member-login`, still under `/portal`. GET only; no form or button.
- Without opt-in: skipped. eslint clean; `tsc` clean.

Handoff (box display `:6`, one member per run; box helper `/tmp/hkwtia-handoff/run-member-portal.sh A|B`):

```bash
DISPLAY=:6 PLAYWRIGHT_PREVIEW_OIDC=true PLAYWRIGHT_BASE_URL=https://hkwtia-git-wtia-hkwtia-plan-r1-20261025-ynwaforevers-projects.vercel.app \
PREVIEW_LOGIN_HANDOFF=true PREVIEW_EXPECT_PORTAL=true PREVIEW_MAGIC_LINK_WAIT_MS=900000 \
  vercel env run -- npx playwright test tests/e2e/preview-oidc-member-magic-link.spec.ts --reporter=list --workers=1
```

Willy types A's (vault 1082203) or B's (vault 1083056) address in the headed window, clicks Send, pastes the "Sign In to hkwtia-m2-preview" link into that window within 5 minutes. Expect `[open] … (portal)`, `[sticky]`, `[dashboard] membership-unavailable`, 11 `[route]` lines, `EXIT=0`.

### Membership walks — still need Willy (fixtures)

Profiles alone give a member session but **no** data for UC22-21/22/23/29/30/35/36/39: Preview has no membership, company, company_members or application rows for A/B. Seeding them is a fixture-design choice (which tiers/statuses, A as company owner, B's seats, whether to fake `ACTIVE` paid memberships without Stripe), not "clearly required", so nothing beyond profiles was written. Options for Willy:

1. **Mirror Production read-only shapes** (A: Corporate `PAYMENT_PENDING` + owned company "Company Test", hidden public page; B: Community `ACTIVE` + one Complete + one Draft application) as Preview-only rows → reproduces the production walks (incl. the UC22-30 seats-unavailable finding) on exact-head.
2. **T22-02 fixture set** (8 memberships, all 7 statuses, SEAT fixture) attached to A/B on Preview → covers UC22-21 multi-membership and UC22-22 statuses.
3. **Members self-serve** via `/join` on Preview (creates applications; paid tiers stop at Stripe, which is not configured for tests) — covers UC22-23 only.

UC22-39 also stays BLOCKED on T-MP08 owner materials regardless.
