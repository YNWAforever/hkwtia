# M5 Showcase acceptance evidence

This record covers the isolated `codex/m5-showcase` branch. It does not
authorize a Production migration, seed, deployment, or shared-environment
mutation.

## Scope and commits

- Base: `eab619c` (M4C)
- Design: `c5f9444` (`docs: define M5 showcase design`)
- Plan: `6d46655` (`docs: plan M5 showcase implementation`)
- Schema/contracts: `85bb7a5`
- Repository/fixture: `53ccbae`
- Member editor: `0d44fa6`
- Staff review: `e823c18`
- Public directory/detail: `13d1ada`
- Request-intro leads: `90c2b16`
- Views/sitemap: `9227b29`

The acceptance-document commit is the commit containing this document.

## Isolated database guard

Run only against an already-migrated, non-Production Neon branch:

```powershell
$env:DATABASE_URL = "<isolated-branch-url>"
$env:DATABASE_URL_TEST = $env:DATABASE_URL
$env:M5_ACCEPTANCE_SEED = "true"
$env:NODE_ENV = "test"
npm.cmd run db:migrate
npm.cmd run db:seed:m5
```

The seed owns the `m5-showcase-acceptance-v1` fixture scope, uses a transaction
and advisory lock, deletes only its own previous rows, and verifies two
published listings plus one pending-review listing. Never put the URL or any
credential in this document, logs, shell history, or source control.

## Deterministic evidence

The unit contracts cover:

- listing status transitions, input/facet/HTTPS URL validation, and public-field
  projection;
- company-manager draft/save/submit lifecycle and staff publish/reject/premium
  authorization;
- premium/category/name ordering, server-side filter query preservation, and
  `SoftwareApplication` JSON-LD with no private fields;
- normalized lead input, honeypot, rate limit, durable insert-before-email,
  provider-failure isolation, and idempotency;
- accessible request-intro form, bilingual message parity, view debounce, and
  guarded bilingual sitemap entries.

The Playwright file has two credential-free contract checks. Its live Preview
browser scenario is explicitly skipped unless `PLAYWRIGHT_BASE_URL` is a
non-Production isolated Preview and `M5_ACCEPTANCE_EMAIL`/
`M5_ACCEPTANCE_PASSWORD` are supplied.

## Fresh verification record

Record the exact output from the following commands before publishing this
branch:

```powershell
npm.cmd test -- --reporter=dot --maxWorkers=4 --minWorkers=1 --testTimeout=15000 --hookTimeout=15000 --teardownTimeout=15000
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e -- tests/e2e/m5-showcase.spec.ts
npm.cmd run audit:strings
```

| Gate | Result | Evidence |
| --- | --- | --- |
| Full Vitest suite | PASS | 244 test files passed, 15 skipped; 1,469 tests passed, 40 skipped |
| TypeScript | PASS | `npm.cmd run typecheck` |
| Lint | PASS | `npm.cmd run lint` |
| Production build | PASS | `npm.cmd run build`; 101 static pages generated; M5 routes present |
| Playwright | PASS | 2 deterministic checks passed; 1 live Preview test skipped without credentials |
| Visible-string audit | PASS | 117 TSX files scanned |
| `git diff --check` | PASS | no whitespace errors before acceptance commit |
| Production/shared env mutation | NONE | no Vercel, Neon, Stripe, or shared env writes in this branch |

## Route and behavior checklist

- `/[locale]/showcase` renders server-side filters and deterministic cards.
- `/[locale]/showcase/[slug]` renders published details, JSON-LD, request-intro
  form, and a hydration-only view beacon; missing/unpublished slugs are 404.
- `/[locale]/portal/company/listing` is manager-editable and member read-only.
- `/[locale]/admin/listings-review` is staff-only; rejection requires a reason.
- `/api/showcase/[slug]/view` always returns `204` and never exposes counts.
- Sitemap includes both localized URLs for published Showcase slugs and keeps
  static entries when database reads fail.
