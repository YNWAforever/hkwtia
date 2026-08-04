# WTIA Platform

The WTIA public platform is a bilingual Next.js App Router site for the Hong Kong Wireless Technology Industry Association. M0 ships the server-rendered public route surface in English and Traditional Chinese (`/` and `/zh`); M1 adds self-service membership, Stripe billing, company seats, and an authenticated member portal; M2 adds the staff-only Admin CRM; M3 adds deterministic member journeys, campaigns, provider boundaries, scheduled jobs, and staff automation operations. M4A adds the bilingual, provider-neutral AI Concierge with durable web and WhatsApp conversations, citations, approvals, telemetry, and retention. M5 adds the member Showcase directory, review workflow, public detail pages, request-intro leads, view debounce, and sitemap indexing. M6 adds the Launch Pad cohort programme, deterministic funding-scheme picker, guarded application flow, staff Kanban, audit trail, and public Gone Global graduate badge.

## Requirements

- Node.js 20+ and npm for the Next.js application
- Node.js 22+ for tooling in `workers/` (required by Wrangler 4.114.0)
- A copy of `.env.example` saved as `.env.local` for local overrides (public M0 pages can run with only `NEXT_PUBLIC_SITE_URL`; M1 database/auth/billing flows require the corresponding server variables)

```sh
npm install
npm run dev
```

Open `http://localhost:3000/` or `http://localhost:3000/zh`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm test` | Run the Vitest unit suite |
| `npm run test:e2e` | Run Playwright browser tests |
| `npm run test:e2e -- tests/e2e/m1-acceptance.spec.ts` | Run deterministic M1 acceptance contracts (live mode is credential-gated) |
| `npm run test:e2e -- tests/e2e/m2-admin-crm.spec.ts` | Run M2 browser acceptance; authenticated tests require isolated Neon/Auth credentials |
| `npm run test:e2e -- tests/e2e/m3-automations.spec.ts` | Run M3 Preview acceptance; tests skip safely when the isolated URL, credentials, or confirmation tokens are absent |
| `npm run test:e2e -- tests/e2e/m5-showcase.spec.ts` | Run deterministic M5 Showcase contracts; live Preview browser checks require explicit isolated credentials |
| `npm run audit:strings` | Reject unapproved visible JSX literals |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run strict TypeScript checking |
| `npm run build` | Create the production build |
| `npm run test:lighthouse` | Run Lighthouse CI on `/membership` and `/zh/membership` |
| `npm run db:migrate` | Apply Drizzle migrations from `drizzle/` using `DATABASE_URL` |
| `npm run db:seed` | Idempotently seed the M1 plans and deterministic M2 CRM demo data |
| `npm run db:seed:m1` / `npm run db:seed:m2` | Run one seed layer directly |
| `npm run db:seed:m3` | Reconcile the deterministic M3 acceptance fixture using explicit `DATABASE_URL` and `M3_SEED_NOW` |
| `npm run db:seed:m4a` | Replace the scoped M4A KB namespace and reconcile the fixed isolated acceptance fixture |
| `npm run db:seed:m5` | Reconcile the opt-in synthetic M5 Showcase fixture in an isolated database |
| `npm run db:seed:m6` | Reconcile the opt-in synthetic M6 Launch Pad fixture in an isolated database |
| `npm test -- tests/integration/m4a-acceptance.test.ts` | Run deterministic M4A acceptance; the database case needs the explicit opt-in gate |
| `npm run eval:concierge` | Run 25 deterministic bilingual Concierge golden cases offline |
| `npm run eval:concierge:live` | Run separately authorized live-provider evals only when every live guard is present |
| `npm test --prefix workers` | Run the isolated Cloudflare automation Worker tests |
| `npm run typecheck --prefix workers` | Type-check the isolated Cloudflare automation Worker |
| `npm run deploy:preview --prefix workers` | Deploy the Preview-only automation Worker |

For a production-style local check:

```sh
npm run build
npm run start
```

Set `PLAYWRIGHT_BASE_URL` or `LHCI_BASE_URL` when browser or Lighthouse checks should target an already running Preview/production deployment. Never commit populated environment values.

The M1 acceptance evidence template is [`docs/m1-acceptance.md`](./docs/m1-acceptance.md). The deterministic acceptance contracts run without credentials; the real Neon/Stripe preview flow is enabled only when isolated `DATABASE_URL_TEST` and Stripe test variables are present.

The M2 evidence is [`docs/m2-acceptance.md`](./docs/m2-acceptance.md). For an authenticated demo, migrate and seed an isolated Neon branch, create test-only Neon Auth staff/member accounts mapped to the seeded profiles, set the seven names documented there, and run the focused M2 Playwright file. Storage state is written only below ignored `test-results`; never copy production database or Auth credentials into the test environment.

## M5 Showcase acceptance

M5 database seeding is intentionally opt-in and isolated. Set `DATABASE_URL` and
`DATABASE_URL_TEST` to the same already-migrated, non-production Neon branch,
set `M5_ACCEPTANCE_SEED=true`, and keep `NODE_ENV` away from production before
running:

```sh
npm run db:migrate
npm run db:seed:m5
```

The seed reconciles only the owned synthetic Showcase companies/listings under
the `m5-showcase-acceptance-v1` key, uses an advisory lock, and never truncates
or mutates M1–M4C data. Do not point it at a shared or Production database, and
do not print or commit database credentials.

The deterministic M5 contract suite can run without credentials:

```sh
npm test -- tests/unit/m5-schema-contract.test.ts tests/unit/m5-contracts.test.ts tests/unit/m5-repository.test.ts tests/unit/m5-seed.test.ts tests/unit/m5-member-listing.test.tsx tests/unit/m5-admin-review.test.tsx tests/unit/m5-public-showcase.test.tsx tests/unit/m5-leads.test.ts tests/unit/m5-request-intro-form.test.tsx tests/unit/m5-views.test.ts tests/unit/sitemap.test.ts
npm run test:e2e -- tests/e2e/m5-showcase.spec.ts
```

The browser file always runs pure contract checks; live member/staff/public
flows skip unless `PLAYWRIGHT_BASE_URL`, `M5_ACCEPTANCE_EMAIL`, and
`M5_ACCEPTANCE_PASSWORD` are explicitly set for an isolated non-Production
Preview. See [`docs/m5-acceptance.md`](./docs/m5-acceptance.md) for the evidence
record and remaining credential-gated scenarios.

## M6 Launch Pad acceptance

M6 uses a separate, explicitly authorized acceptance seed. Set `DATABASE_URL`
and `DATABASE_URL_TEST` to the same migrated isolated database,
`M6_ACCEPTANCE_DATABASE_HOST_ALLOWLIST` to its exact normalized hostname, and
`M6_ACCEPTANCE_SEED=true` before running `npm run db:seed:m6`. The guard
rejects Production mode, a missing/mismatched test URL, or an unlisted host.
The seed only reconciles the synthetic `m6-launch-pad-acceptance-v1` scope.

The credential-free deterministic browser checks use intercepted fixtures:

```powershell
$env:PLAYWRIGHT_BASE_URL = "http://127.0.0.1:3333"
npm.cmd run test:e2e -- tests/e2e/m6-launch-pad.spec.ts
```

Live Preview smoke remains skipped unless `M6_PREVIEW_URL`,
`M6_PREVIEW_MEMBER_EMAIL`, and `M6_PREVIEW_ADMIN_EMAIL` are all explicit;
the test rejects the known Production hostname. See
[`docs/m6-acceptance.md`](./docs/m6-acceptance.md) for the fixture answers,
journey demonstration, and verification record.

## M3 acceptance

The M3 seed is intentionally opt-in. Set `DATABASE_URL` to an isolated,
currently migrated test or Preview database and set `M3_SEED_NOW` to one
explicit ISO-8601 instant that includes `Z` or a numeric timezone offset. Then
run:

```sh
npm run db:seed:m3
```

The seed uses fixed, visibly synthetic identities under `m3.example.test`,
derives its Day-7 and renewal D-14 rows from the controlled Hong Kong calendar
day, and reconciles only its fixed fixture scope in one advisory-locked
transaction. Do not point it at a shared or production database.

The Postgres acceptance suite runs its five destructive cases only when
`DATABASE_URL_TEST` is a valid TLS Neon URL,
`M3_ACCEPTANCE_ALLOW_DESTRUCTIVE` is exactly `isolated-preview`, and
`M3_ACCEPTANCE_EXPECTED_DB_HOST` exactly matches the normalized hostname parsed
from that URL. The guard rejects production-looking hosts and reuse of the
runtime database before opening a connection or cleaning any rows. Without
`DATABASE_URL_TEST`, the cases are collected and reported as skipped; with a
configured URL but an incomplete or mismatched guard, collection fails closed.
Migrate the isolated database before running the focused integration file.
Provider calls remain local: email uses the test transport, and WhatsApp uses
credential-free mock mode.

For browser acceptance, deploy the same seeded database to an isolated Preview,
map test-only staff and member Auth accounts to the seeded profile IDs, and set
`PLAYWRIGHT_BASE_URL`, `M3_E2E_ALLOWED_ORIGIN`, the four `M3_TEST_*` credential
names, and both `M3_TEST_UNSUBSCRIBE_TOKEN_*` names outside the repository.
For a remote run, the allowlisted origin must exactly match a preview-safe
HTTPS `*.vercel.app` target; `https://hkwtia.vercel.app`, remote HTTP, and
arbitrary hosts are rejected before credentials or unsubscribe tokens are
used. Loopback targets are exempt from the remote allowlist. Set
`VERCEL_SHARE_TOKEN` only when the validated Preview is protected; it provides
Preview authentication and never authorizes the target. Generate unsubscribe
confirmation tokens from that Preview's signing configuration and never commit
populated values.

## M3 Preview automation Worker

The isolated [`workers`](./workers) package contains the Preview-only Cloudflare Cron Worker. It invokes the authenticated Next.js job routes and does not own journey or delivery state. Its UTC triggers are:

- Hourly: journey runner and approval expirer
- 02:00: renewal runner
- 18:00: engagement-score runner

Cloudflare fires matching overlapping cron expressions as separate events. Each HTTP attempt uses manual redirect handling and a fixed 10-second deadline; redirect responses fail without following their `Location` target.

Configure these Worker bindings in Cloudflare Preview:

- `APP_URL`: the canonical HTTPS origin of the matching Vercel Preview deployment. Plain HTTP is accepted only for `localhost` development.
- `CRON_SECRET`: the same non-empty bearer secret configured on the matching Next.js Preview deployment.

Keep both values out of `wrangler.toml` and committed environment files. Add them interactively without placing real values in shell history:

```sh
cd workers
npx wrangler secret put APP_URL --env preview
npx wrangler secret put CRON_SECRET --env preview
cd ..
```

Install and verify the Worker independently from the root application:

```sh
npm ci --prefix workers
npm test --prefix workers
npm run typecheck --prefix workers
```

After Preview bindings and the matching Next.js Preview are ready, deploy only the isolated Preview Worker:

```sh
npm run deploy:preview --prefix workers
```

## M4A AI Concierge operations

M4A adds the provider-neutral bilingual Concierge for web and WOZTELL
WhatsApp. Keep `AGENTS_ENABLED=false` for initial setup and rollback. The
agent runs only when the value is exactly `true`; disabled turns still create
a zero-cost `agent_runs` record and a scoped leave-message staff task without
constructing a provider or embedding client.

Configure server-only values from `.env.example`. Never place populated
provider, database, cookie, webhook, Turnstile, or approval values in source
control. `CONCIERGE_COOKIE_SECRET` must be an independent high-entropy secret,
not the Neon Auth cookie secret.

Apply and seed an isolated environment in this order:

```sh
npm run db:migrate
npm run db:seed:m1
npm run db:seed:m2
# M3 is optional for an M4A-only fixture and retains its own M3_SEED_NOW guard
npm run db:seed:m3
npm run db:seed:m4a
```

`db:seed:m4a` requires `DATABASE_URL` and `OPENAI_API_KEY` because production
knowledge vectors use the live embedding adapter. It replaces only the
`m4a-core-v1` KB namespace, reconciles the fixed
`m4a-acceptance-member` and two `m4a-*` events, and clears only that synthetic
member's Concierge approval/task residue. It never truncates or cleans M1-M3
fixtures.

The deterministic acceptance and evaluation gates require no external
credentials:

```sh
npm test -- tests/integration/m4a-acceptance.test.ts
npm run eval:concierge
npm run build
# In another terminal, serve the production build with the normal required
# production variables pointed at isolated/non-live values, plus both exact gates:
APP_URL=http://localhost:3000 M4A_DETERMINISTIC_ACCEPTANCE=true M4A_DETERMINISTIC_ACCEPTANCE_AUTHORIZED=true npm run start
# Then target that local production server (the gate rejects non-loopback hosts):
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e -- tests/e2e/concierge.spec.ts
```

The acceptance suite uses an in-memory persistence boundary and deterministic
provider behind the real Concierge service/runtime/tool composition. The
production-build browser gate requires both exact flags above, rejects any
non-empty `VERCEL` or `VERCEL_ENV`, and requires `APP_URL` to be a loopback
origin that exactly matches the request origin. Only `localhost`, `127.0.0.1`,
or `::1` are accepted, so a hosted runtime or forged localhost request URL
cannot activate it. The boundary performs no provider, database, email,
WOZTELL, or deployment network calls. Set `RUN_DATABASE_TESTS=true` and `DATABASE_URL_TEST` only for an
explicitly isolated, migrated test database; this separately enables the fixed
fixture reconciliation case.

Live model evaluation is a distinct manual action and requires all of
`RUN_LIVE_AI_EVALS=true`, `RUN_LIVE_EVALS=1`,
`LIVE_AI_EVALS_AUTHORIZED=true`, and the selected provider key before running
`npm run eval:concierge:live`. Ordinary CI and commits use only the
deterministic evaluator.

Production enablement remains blocked until named business and technical
approvers have recorded prompt/policy approval in the release ticket, both
WOZTELL templates (`concierge_follow_up_en` and
`concierge_follow_up_zh_hk`) are approved with the exact two body parameters,
and live acceptance is separately authorized. Live WhatsApp also requires
`RUN_LIVE_WOZTELL=1`; set `WOZTELL_APPROVED_TEMPLATE_KEYS` only to template
keys confirmed approved by WOZTELL. The live acceptance fixture has its own
`RUN_LIVE_WOZTELL_ACCEPTANCE=1` gate and
`WOZTELL_ACCEPTANCE_APPROVED_TEMPLATE_KEYS` allowlist.

Chat retention is invoked by the authenticated daily retention job and removes
Concierge transcript data at the twelve-month cutoff in bounded, idempotent
batches. `CRON_SECRET` must match the caller; verify dry-run counts before the
first production mutation.

Rollback does not require a schema downgrade:

1. Set `AGENTS_ENABLED=false` and redeploy, which preserves leave-message
   handling and zero-cost run evidence.
2. Set `RUN_LIVE_WOZTELL` to a non-`1` value and remove live template
   allowlisting.
3. Stop the retention scheduler while investigating; do not reverse or
   truncate additive migrations.
4. Restore the prior application deployment if needed. Preserve conversations,
   `agent_runs`, pending approvals, staff tasks, and audit evidence for review.

## Deployment

The repository is configured for Vercel. Import the GitHub repository, set the variables listed in `.env.example` through the Vercel project settings, and deploy the branch. Preview deployments should use a safe public URL. Configure isolated Neon and Stripe test variables before exercising authenticated M1 flows; the build remains safe without runtime credentials.

Before promotion, run the repository gates:

```sh
npm run audit:strings
npm test
npm run lint
npm run typecheck
npm run build
npm run test:e2e
npm audit --omit=dev --audit-level=high
```

## Repository guidance

See [`AGENTS.md`](./AGENTS.md) for i18n, accessibility, server-component, test, commit, and secret-handling conventions.
