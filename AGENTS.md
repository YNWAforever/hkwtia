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

## Conventions

- Use strict TypeScript and avoid `any` unless the code includes a reasoned comment.
- Prefer typed content contracts over fabricated data or client-side fetching for public pages.
- Use conventional commits: `feat:`, `fix:`, `test:`, `chore:`, or `docs:`.
- Run the focused test, full unit suite, lint, typecheck, and build before handing off a change.
- Keep accessibility landmarks, skip navigation, keyboard focus, and localized recovery states intact.

## Task 11 database setup

Create an isolated Neon branch/database for migration and seed verification. Put its pooled connection string in `DATABASE_URL_TEST` only in the local test environment; never commit or print the value. Run `npm run db:migrate` before `npm run db:seed`.

The seed writes only the four stable plan rows (`community`, `startup`, `corporate`, and `patron`) and uses `ON CONFLICT` updates, so running it twice is safe and creates no personal data.

For Stripe test-mode acceptance work, use test-mode values for `STRIPE_TEST_SECRET_KEY`, `STRIPE_TEST_WEBHOOK_SECRET`, `STRIPE_TEST_STARTUP_PRICE_ID`, and `STRIPE_TEST_CORPORATE_PRICE_ID`. Keep production Stripe variables separate and do not use live keys against the test database.

## Changelog

- M0: public bilingual route surface, metadata, structured data, crawler endpoints, translation parity, and accessibility gates.
- M1 Task 1: server-only runtime configuration, Neon/Drizzle client foundation, and non-placeholder database commands.
- M1 Task 11: idempotent plan seed, isolated migration-test contract, and Neon/Stripe test-environment documentation.

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
