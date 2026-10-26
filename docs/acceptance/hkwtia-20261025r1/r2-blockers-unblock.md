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
| Box `vercel` CLI | **Logged out** (no `.vercel/`, no `auth.json`); `vc curl` / `vc env run` cannot mint `VERCEL_OIDC_TOKEN` yet |
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
| Document SSO/OIDC/share/CI/Stripe status (this file) | `vercel login` on the box (or share URL / authorized bypass) so Preview OIDC/`vc curl` can be proven |
| Keep `stacked-ci-trigger.patch` prepared and unapplied | Fix GitHub Actions billing/spending limit on the org/account |
| Local anonymous/LHCI already recorded; contrast fixed | Supply Stripe **test** price IDs into local acceptance **or** authorize Preview catalog check after SSO access |
| Production Auth A/B/staff Google evidence already on PR | Magic-link A + staff confirmation; staff-D fixture role; zero-write DB readback; screen reader |
| | T-MP08 materials, T-MP10 legal, T-MP12 contracts |
| | Any production promote/deploy of PR #212 (not requested) |

## Recommended next concrete step

**Sign the box Vercel CLI in as Willy (`vercel login` + `vercel link` to `hkwtia`), then run the preferred `vc curl` smoke against `https://hkwtia-l4eh06gmt-ynwaforevers-projects.vercel.app/`.** If that returns the app (not SSO), record the procedure result here and run a minimal anonymous Preview fetch (home + `/membership` headings) for UC22-01/03 exact-head evidence. In parallel, clear GitHub Actions billing so #211 CI can run before anyone applies `stacked-ci-trigger.patch`.
