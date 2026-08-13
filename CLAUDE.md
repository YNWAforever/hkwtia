# WTIA Platform — Claude Code instructions

**[AGENTS.md](./AGENTS.md) is the canonical contributor guide and changelog. Read it first.**
This file adds the structural rules that are easy to violate and expensive to undo.

> Overrides the global `~/CLAUDE.md` defaults: this project uses **Neon Postgres + Drizzle**
> (not Supabase) and **Tailwind v3 with `tailwind.config.ts`** (not v4 CSS config).

## Stack

Next.js 16 App Router (Webpack, not Turbopack) · React 19 · TypeScript strict · Tailwind v3 +
shadcn/ui · Drizzle ORM on Neon serverless Postgres · next-intl v4 (`en`, `zh-HK`) ·
Vercel AI SDK v7 (OpenAI + Anthropic) · Stripe · Resend · Cloudflare Worker in `workers/`.

## Commands

```sh
npm run dev          # next dev --webpack
npm test             # vitest (tests/unit + tests/integration)
npm run test:e2e     # playwright
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run build        # next build --webpack
npm run audit:strings  # rejects unapproved visible JSX literals
npm run db:migrate   # drizzle migrations from drizzle/
npm run db:seed      # idempotent M1 plans + deterministic M2 demo data
```

Run the focused test, full unit suite, lint, typecheck, and build before handing off.

## Hard boundaries

These are enforced by lint rules or tests. Breaking one fails CI, and several have already
caused production incidents recorded in the AGENTS.md changelog.

1. **Database access lives in `lib/db/repos/`.** ESLint blocks importing `@/lib/db/client` or
   `@/lib/db/repos/common` from anywhere else under `lib/`.
2. **Repositories are the authorization gate.** They take an `Actor` and call
   `requireAdmin(actor)` themselves (~46 sites). Do not authorize only at the page or action.
3. **`"use server"` modules must not export actor-taking functions.** That directive publishes
   every export as an HTTP endpoint, so an exported `fn(actor, …)` accepts a forged actor. Put
   the logic in a sibling `*-core.ts` and export only the actor-resolving wrapper. A discovery
   test enforces this.
4. **Import `@/lib/auth/authorize` when you already hold an `Actor`.** `@/lib/auth/actor` reads
   the session and transitively pulls in `lib/auth/server`, which calls `authEnv()` at module
   scope — a hard failure in production without the Neon Auth pair. That import alone once broke
   `/sitemap.xml`, `/events`, `/showcase` and `/launchpad`.
5. **Never hand-build a locale prefix.** `zh-HK` is served at `/zh`. Use `localizedPath` for
   `<Link href>`; `` `/${locale}/…` `` renders `/zh-HK/…`, which the proxy does not recognise.
   `revalidatePath` is the exception — it takes the internal path, where `/zh-HK/…` is correct.
   Pinned by `tests/unit/locale-href-boundary.test.ts`.
6. **Every user-visible string goes in `messages/en.json` and `messages/zh-HK.json`**, in parity.
   `npm run audit:strings` fails on unapproved JSX literals.
7. **`lib/db/schema-core.ts` is Drizzle's build-time schema.** Runtime server code imports
   `lib/db/server-schema.ts`. Client modules never import the core.
8. **Env access is feature-scoped.** Call `databaseEnv()`, `authEnv()`, `billingEnv()`, `aiEnv()`
   from `lib/config/env.ts`. There is no single `serverEnv()` — a page that needs the database
   must not transitively require the Stripe or Auth variables.

## Conventions

- Server Components by default; `'use client'` only for interactive browser behaviour (25 files).
- Files are kebab-case, without exception (378/378).
- Strict TypeScript; no `any` unless the code carries a reasoned comment.
- Zod for input validation at every boundary.
- Public pages degrade rather than 500 — read with `.catch(() => [])` and render an empty state.
- Mutations that matter write an `auditEvents` row in the same transaction.
- Comments explain *why*, usually the incident behind a rule. Match that density; keep them.
- Conventional commits: `feat:` `fix:` `test:` `chore:` `docs:` `refactor:`.

## Layout

```
app/[locale]/(public|member|join|admin)/  route groups by audience
app/api/{ai,jobs,stripe,webhooks,auth}/   route handlers
lib/db/repos/                              ALL database access + authorization
lib/{ai,automation,admin,billing,membership,showcase,launchpad}/  domain logic
lib/config/env.ts                          feature-scoped env contracts
config/                                    static site/agent/journey configuration
messages/{en,zh-HK}.json                   translation bundles (must stay in parity)
drizzle/                                   numbered SQL migrations, M1→M7
docs/superpowers/{specs,plans}/            per-milestone design docs
workers/                                   separate Cloudflare Worker (own package.json)
```

## Seeds and test databases

Every seed past M1 is opt-in and guarded: it requires an explicit flag, a matching
`DATABASE_URL_TEST`, and for M6 a hostname allowlist. Never point a seed or a destructive
acceptance test at a shared or production database.

## Known deadline

`lib/email/unsubscribe-token.ts` sets `LEGACY_UNSUBSCRIBE_SECRET_SUNSET = "2026-09-06"`. On that
date `tests/unit/unsubscribe-secret-rotation.test.ts` starts failing by design. Remove the
`cronSecret` fallback from `lib/api/unsubscribe-route.ts` and
`app/[locale]/(public)/unsubscribe/page.tsx`, then delete the constant and that test.
