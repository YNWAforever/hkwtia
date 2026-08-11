# WTIA Platform contributor guide

## Stack and defaults

- Next.js App Router with TypeScript strict mode, Tailwind CSS, shadcn/ui, and `next-intl`.
- Server Components are the default. Add `'use client'` only for interactive browser behavior.
- Every user-visible string belongs in `messages/en.json` and `messages/zh-HK.json`; keep the bundles in parity.
- Do not add secrets to source control. Use `.env.example` for names only and `process.env` at runtime.
- Keep database and integration work server-side; M1 runtime configuration owns the Neon, Auth, and Stripe server credentials. Keep those modules server-only.
- `lib/db/schema-core.ts` is Drizzle's build-time schema; runtime server code imports `lib/db/server-schema.ts`, and client modules never import the core directly.

## Commands

```sh
npm install
npm run dev
npm test
npm run test:e2e
npm run audit:strings
npm run lint
npm run typecheck
npm run build
npm run db:migrate
npm run db:seed
```

`db:migrate` runs Drizzle migrations through `scripts/db-migrate.ts`; `db:seed` runs the idempotent M1 plan seed through `scripts/db-seed.ts` (with `db:seed:m1` available for the direct runner). Keep `DATABASE_URL` in the environment and never print it.

`db:seed` runs the M1 plan seed and then the deterministic M2 demo seed. `db:seed:m2` runs only the M2 fixture layer with `node --experimental-strip-types`; migrate and seed M1 first when using it directly.

`db:seed:m6` is the separately guarded Launch Pad acceptance fixture. It requires
`M6_ACCEPTANCE_SEED=true`, equal `DATABASE_URL`/`DATABASE_URL_TEST` values, and
an exact `M6_ACCEPTANCE_DATABASE_HOST_ALLOWLIST` entry for an explicitly
allowlisted, non-Production database hostname. The guard blocks Production-mode
execution and unallowlisted hosts, but it cannot establish that a host is
isolated; the operator must confirm the selected database is isolated before
seeding.

## Conventions

- Use strict TypeScript and avoid `any` unless the code includes a reasoned comment.
- Prefer typed content contracts over fabricated data or client-side fetching for public pages.
- Use conventional commits: `feat:`, `fix:`, `test:`, `chore:`, or `docs:`.
- Run the focused test, full unit suite, lint, typecheck, and build before handing off a change.
- Keep accessibility landmarks, skip navigation, keyboard focus, and localized recovery states intact.
- Work test-first. Write the test, **run it, and read the failure** before writing the code that
  satisfies it. Watching it fail is the part that carries the value: a test that has never failed is
  a claim, not evidence. Two assertions in this repo had silently stopped testing anything —
  `m4b-runtime-guard` compared a position against `indexOf("serverEnv()")` after that call was
  renamed, so it asserted `112 < -1` and became unsatisfiable, and a slightly different refactor
  would have made it vacuously *pass* instead. Confirm the failure names the behaviour you meant,
  not a typo, a missing import, or a `-1`.
- A test that guards an invariant should prove it can still catch a violation. The established
  shape for this is `server-action-actor-boundary.test.ts`: it discovers its own targets, asserts a
  minimum count so a broken walk cannot pass vacuously, and carries a `detects the shapes it is
  meant to catch` case with hostile and safe samples. Reuse that shape for boundary and discovery
  tests, and when adding one for a bug that reached `main`, reintroduce the bug once to watch the
  new test fail.
- Prefer assertions on behaviour over assertions on source text. Where a source-level check really
  is the only option, anchor it on the property that matters — any `*Env()` accessor, a property
  name — rather than one spelling that a rename will quietly retire.

## Task 11 database setup

Create an isolated Neon branch/database for migration and seed verification. Put its pooled connection string in `DATABASE_URL_TEST` only in the local test environment; never commit or print the value. Run `npm run db:migrate` before `npm run db:seed`.

The combined seed writes the four stable plan rows (`community`, `startup`, `corporate`, and `patron`) followed by the M2 demo contract: exactly 30 non-personal `.example.test` profiles, 12 companies, one staff, one ExCo, one superadmin, varied member histories, four events, saved segments, one queued campaign, and pending approvals. The fixed M2 reference instant is committed in `scripts/seed-m2.ts`; the engineered corporate segment and production at-risk query return exactly `m2-risk-01`, `m2-risk-02`, and `m2-risk-03` in renewal order when evaluated at that instant. Mutable fixture rows use idempotent upserts and immutable history rows use stable IDs with conflict-ignore semantics, so a second run creates no duplicates.

Use only an isolated `DATABASE_URL_TEST` for M2 migration/seed acceptance. With no test URL, the acceptance suite skips; `RUN_POSTGRES_INTEGRATION=1` opts into a disposable local PostgreSQL 16 container. Never point fixture commands at production.

For Stripe test-mode acceptance work, use test-mode values for `STRIPE_TEST_SECRET_KEY`, `STRIPE_TEST_WEBHOOK_SECRET`, `STRIPE_TEST_STARTUP_PRICE_ID`, and `STRIPE_TEST_CORPORATE_PRICE_ID`. Keep production Stripe variables separate and do not use live keys against the test database.

## Changelog

- M0: public bilingual route surface, metadata, structured data, crawler endpoints, translation parity, and accessibility gates.
- M1 Task 1: server-only runtime configuration, Neon/Drizzle client foundation, and non-placeholder database commands.
- M1 Task 11: idempotent plan seed, isolated migration-test contract, and Neon/Stripe test-environment documentation.
- M2 Task 11: deterministic non-PII CRM demo fixtures, combined seed command, and isolated PostgreSQL acceptance assertions.
- M2 Task 12: real Neon Auth browser boundary, credential-gated Admin CRM Playwright flows, exact fixture-count acceptance, and preview release evidence.
- M6 Task 7: deterministic Launch Pad browser fixtures, isolated-seed evidence, guarded Preview smoke, and public graduate-badge acceptance record.
- M7.1: staff news authoring on `/admin/news` scoped to `kind: "news"`, publication recorded as in-transaction audit rows, and the static news path retired.
- M7.2: staff-editable marketing copy — 194 allowlisted strings merged over the message bundles in `i18n/request.ts`, fail-soft so a build without `DATABASE_URL` still serves shipped copy.
- M7.3: curated media registry — staff register own-origin images on `/admin/media` and attach them to showcase listings, which now render a logo; adds an image-scoped CSP and closes an obfuscation bypass in the logo-reference validator.
- M7.3 follow-up: `"use server"` modules no longer export actor-taking helpers. That directive publishes every export as an HTTP endpoint, so nine of them across admin, portal, showcase and Launch Pad accepted a forged actor and bypassed authorization entirely; a discovery test now enforces the boundary.
- Security hardening: rate-limited the auth send and credential endpoints at both entrypoints (the `/join` Server Action calls the upstream service directly and never crosses our route); split `UNSUBSCRIBE_TOKEN_SECRET` out of `CRON_SECRET`, with a dual-verify fallback that **must be removed after 2026-09-06** (a test fails once that date passes); added `frame-ancestors`/`X-Frame-Options` and the other static headers; capped the feedback and Woztell bodies; stopped the showcase view beacon being inflatable via the user-agent; and made a missing Turnstile pair fail the production boot instead of silently disabling the captcha.
- Pages/CMS audit: fixed nine `<Link>` hrefs built as `` `/${locale}/…` ``. `zh-HK` is served under the `/zh` prefix, so those rendered `/zh-HK/…`, which the middleware does not recognise — the Chinese news, page-copy, media and events-mgmt editors were reachable only by typing a URL, and every event on the Chinese `/events` listing 404'd. They now use `localizedPath`, and `tests/unit/locale-href-boundary.test.ts` keeps hand-built locale prefixes out. `revalidatePath` is untouched: it takes the internal path, where `/zh-HK/…` is correct. Also repaired two source-text assertions that the feature-scoped env refactor had silently inverted — `m4b-runtime-guard` compared against a `serverEnv()` that no longer existed, so its ordering check passed a `-1`.
- Public route environment isolation, continued: `requireAdmin`/`systemActor` moved to `lib/auth/authorize.ts`. They decide against an `Actor` the caller already holds and read no session, but living in `lib/auth/actor` meant importing either one pulled in `lib/auth/server`, which calls `authEnv()` at module scope. Because `import` is transitive, `/sitemap.xml` failed on import — before its per-read `try`/`catch` could run — whenever the Neon Auth pair was absent. 26 modules now import the pure helpers directly; `lib/auth/actor` re-exports them for callers that read the session anyway. The fail-closed contract is untouched: importing `lib/auth/server` still throws in production, as `auth-server-runtime.test.ts` pins. `/join` and `/launchpad` still require the pair, because they genuinely import session-reading code.

<!-- codebase-memory-mcp:start -->
# Codebase Knowledge Graph (codebase-memory-mcp)

This project uses codebase-memory-mcp to maintain a knowledge graph of the codebase.
ALWAYS prefer MCP graph tools over grep/glob/file-search for code discovery.

## Priority Order
1. `search_graph` — find functions, classes, routes, variables by pattern
2. `trace_path` — trace who calls a function or what it calls
3. `get_code_snippet` — read specific function/class source code
4. `query_graph` — run Cypher queries for complex patterns
5. `get_architecture` — high-level project summary

## When to fall back to grep/glob
- Searching for string literals, error messages, config values
- Searching non-code files (Dockerfiles, shell scripts, configs)
- When MCP tools return insufficient results

## Examples
- Find a handler: `search_graph(name_pattern=".*OrderHandler.*")`
- Who calls it: `trace_path(function_name="OrderHandler", direction="inbound")`
- Read source: `get_code_snippet(qualified_name="pkg/orders.OrderHandler")`
<!-- codebase-memory-mcp:end -->
