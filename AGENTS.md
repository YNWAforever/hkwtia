# WTIA Platform contributor guide

## Stack and defaults

- Next.js App Router with TypeScript strict mode, Tailwind CSS, shadcn/ui, and `next-intl`.
- Server Components are the default. Add `'use client'` only for interactive browser behavior.
- Every user-visible string belongs in `messages/en.json` and `messages/zh-HK.json`; keep the bundles in parity.
- Traditional Chinese is Hong Kong register, not Taiwan. Follow `docs/i18n-glossary.md` for agreed terms, the
  ones that deliberately differ by context, and punctuation; `tests/unit/messages.test.ts` enforces the
  mechanical rules (a zh value must contain Chinese, no `?` runs, no stray bookkeeping keys).
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
- i18n enforcement: `scripts/audit-visible-strings.mjs` exempted punctuation-only JSX text, never read module-level constants, and never read visible props. Those holes were hiding eight hard-coded ASCII colons rendering as `會員: 1` and an untranslated architecture diagram on the public `/zh/ai-ops` page. Separators now go through `labelSeparator` in `lib/i18n/punctuation.ts`; each exemption is a narrow named allowlist.
- Fleet-wide rate limiting: the auth send and credential buckets moved from `createInMemoryRateLimiter` to the `rate_limits` table (migration `0018`), because a process-local count on serverless meant the real ceiling was `limit x concurrent instances` — the per-address bucket that protects a victim's inbox was the one that mattered. One atomic upsert per check; degrades to the process-local bucket if the store is unreachable, so a database blip cannot become a sign-in outage. **Requires `npm run db:migrate` before deploy.**
- zh-HK repair: the entire `Admin.segments` namespace had shipped as literal ASCII question marks since M2 — `/admin/segments` rendered as a page of `?` in Chinese. Rewrote all 33 strings, converged genuine terminology divergences, stopped a nested `_review` flag leaking into every zh page's HTML, and added the mechanical checks plus `docs/i18n-glossary.md` that would have caught it.

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
