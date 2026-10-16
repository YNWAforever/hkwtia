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

## Active boundaries and targeted history

- Every exported `"use server"` action must establish its own authenticated
  actor. Keep actor-taking helpers in server-only modules.
- Preserve bilingual `/zh` routing via `localizedPath`, published-only public
  data, shared URL validation, and the distinction between missing records
  and failed reads. Keep pure authorization separate from session loading.
- Unsubscribe verification uses `UNSUBSCRIBE_TOKEN_SECRET`; never restore
  the retired `CRON_SECRET` fallback. Keep feature-scoped runtime env access.
- Messaging must preserve both consent stores, locale/template approval,
  per-attempt deduplication, send claims/timeouts, provider field bounds,
  and transactional audit records. Unsupported audience filters must fail
  closed, never widen a recipient set.
- Existing database isolation, test-mode, approval and verification
  requirements above remain mandatory. A plan, mocked provider result or
  skipped acceptance check is not live acceptance evidence.

Before changing a relevant area, read its linked history section:

- Public routes, auth, CMS, media and admin:
  [M0–M7 and admin boundaries](docs/agent-history.md#public-and-admin).
- Programme records or archive claims:
  [programme migration](docs/agent-history.md#programme-records).
- Member directory, URL policy or scoped database reads:
  [Phase B2](docs/agent-history.md#member-directory).
- Programme image claims:
  [image evidence](docs/agent-history.md#programme-images).
- Test boundaries, token expiry or secret verification:
  [test lessons and secret sunset](docs/agent-history.md#tests-and-secrets).
- Events, reminders or render-test reliability:
  [Phase B gate hardening](docs/agent-history.md#events-and-reminders).
- Inbox, consent, idempotency, provider parsing or migration sequencing:
  [Phase C1](docs/agent-history.md#whatsapp-human-lane), including paired
  migrations 0031/0032 and enum constraints.
- Segments, campaign recipients, live messaging, metrics or reminder locales:
  [Phase C2 and reconciliation](docs/agent-history.md#segments-and-go-live)
  and the ordered [WhatsApp go-live guide](docs/integration/phase-c-whatsapp-go-live.md).

The history records prior evidence; verify claims against the current
checkout when implementing. Read only the sections relevant to the task.

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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
