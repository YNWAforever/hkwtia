# WTIA Platform

The WTIA public platform is a bilingual Next.js App Router site for the Hong Kong Wireless Technology Industry Association. M0 ships the server-rendered public route surface in English and Traditional Chinese (`/` and `/zh`); M1 adds self-service membership, Stripe billing, company seats, and an authenticated member portal; M2 adds the staff-only Admin CRM; M3 adds deterministic member journeys, campaigns, provider boundaries, scheduled jobs, and staff automation operations.

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
| `npm run audit:strings` | Reject unapproved visible JSX literals |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run strict TypeScript checking |
| `npm run build` | Create the production build |
| `npm run test:lighthouse` | Run Lighthouse CI on `/membership` and `/zh/membership` |
| `npm run db:migrate` | Apply Drizzle migrations from `drizzle/` using `DATABASE_URL` |
| `npm run db:seed` | Idempotently seed the M1 plans and deterministic M2 CRM demo data |
| `npm run db:seed:m1` / `npm run db:seed:m2` | Run one seed layer directly |
| `npm run db:seed:m3` | Reconcile the deterministic M3 acceptance fixture using explicit `DATABASE_URL` and `M3_SEED_NOW` |
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

The Postgres acceptance suite uses only `DATABASE_URL_TEST`; without that
isolated database its five destructive cases are collected and reported as
skipped. Migrate the isolated database before running the focused integration
file. Provider calls remain local: email uses the test transport, and WhatsApp
uses credential-free mock mode.

For browser acceptance, deploy the same seeded database to an isolated Preview,
map test-only staff and member Auth accounts to the seeded profile IDs, and set
`PLAYWRIGHT_BASE_URL`, the four `M3_TEST_*` credential names, and both
`M3_TEST_UNSUBSCRIBE_TOKEN_*` names outside the repository. Set
`VERCEL_SHARE_TOKEN` only when the HTTPS Vercel Preview is protected. Generate
unsubscribe confirmation tokens from that Preview's signing configuration;
never commit populated values.

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