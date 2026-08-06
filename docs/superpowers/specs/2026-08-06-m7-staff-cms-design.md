# M7 Staff CMS Design

## Goal and acceptance boundary

WTIA staff had a substantial admin panel — members, segments, at-risk, events,
listings review, cohorts, approvals, reports, automations — but no way to change
anything a visitor reads. News could not be published at all, and every sentence
on the marketing pages needed a developer, a commit and a deploy.

M7 closes that gap by reusing the admin CRUD stack the repo already has, rather
than introducing a CMS as a new system. It ships in three parts:

- **M7.1 News authoring** — staff write and publish bilingual news posts on
  `/[locale]/admin/news`, backed by the existing `posts` table.
- **M7.2 Page copy** — staff replace individual marketing strings on
  `/[locale]/admin/page-copy`, with the message bundles as fallback.
- **M7.3 Media** — a registry of image references, then optional upload. Not
  started.

M7.1 and M7.2 acceptance requires:

- an admin can create, edit, publish and unpublish a news post; a published one
  appears on `/news`, at its slug and in the sitemap, and a draft or
  future-dated one appears in none of them;
- a build log stays unreachable from the news UI, and a news post never appears
  in the public AI-Ops evidence panel;
- publishing writes a `post.published` audit row in the same transaction as the
  update, because `posts` has no column recording who published;
- an admin can override any of 194 marketing strings per locale, and the public
  page reflects it after revalidation;
- an override can only ever replace an existing leaf string — it can never add a
  key, change a page's structure, or remove a section;
- `next build` still succeeds with no `DATABASE_URL`.

Out of scope: events, showcase listings, cohorts, members, segments and
approvals (already staff-managed); extending the `SafeStructuredContent`
grammar; approval-gated publishing.

## Options considered

1. **Reuse the admin CRUD stack, the `posts` table and the message bundles
   (selected).** Every admin section in this repo is the same six-layer stack;
   news is a seventh instance of it, and page copy is an eighth. Page copy
   merges at one point in `i18n/request.ts`, so no page changes at all. The
   bundles stay the structural source of truth and the fallback.
2. **A general content model — pages, blocks, fields.** Would cover cases the
   association does not have, and would make every public page a database read
   with no static fallback. Rejected: it replaces working prerendered pages with
   a runtime dependency to buy flexibility nobody asked for.
3. **An external headless CMS.** Removes the build entirely from the loop, but
   adds a vendor, a second authorization model, a second audit trail and a
   webhook surface. Rejected as disproportionate to nine marketing pages.

## Architecture

### M7.1 — News

`lib/db/repos/admin-posts.ts` scopes every staff method to `kind: "news"`, so
board drafts (`kind: "page"`, owned by the `board_reporter` agent) and build
logs (`kind: "buildlog"`, seed-owned) are unreachable from the news UI. This is
load-bearing, not tidiness: four test files plus `tests/e2e/m4b-agents.spec.ts`
assert that no publish control exists anywhere on `/admin/approvals`,
`/admin/reports` or the board-draft preview. News therefore lives on its own
route, with its own repository module and its own component.

`posts.publishedAt` is a nullable timestamp rather than a boolean, so the form
maps a checkbox to an instant and back. Re-saving a published post keeps its
original instant, so an edit does not reorder the feed. `titleZh` is NOT NULL,
unlike `events.titleZh`, so the form requires both locales.

Because `posts` has no column naming the author or publisher — and
`tests/unit/m4b-schema-contract.test.ts` pins its column set — publication is
recorded as `post.published` / `post.unpublished` audit rows written inside the
same transaction as the update, mirroring `approvals.decide`. The audit row *is*
the record of who published.

On the public side, `listPublishedNews` / `getPublishedNewsBySlug` were added
**alongside** `listPublishedBuildLogs` rather than widening it: the build-log
reader also feeds the public AI-Ops evidence panel, so widening its predicate
would publish news articles as engineering evidence.

Shipping this removed a parallel code path — `content/news.ts`,
`lib/news/build-log-visibility.ts` and the slug-collision reconciliation existed
only to merge a static file with the database.

### M7.2 — Page copy

**Scope.** 194 leaf strings across nine namespaces: `Home` (32), `About` (14),
`Chairman` (8), `Committees` (12), `Contact` (6), `programs` (12), `Membership`
(34), `Privacy` (46), `AiTransparency` (30). The product UI namespaces
(`LaunchPad`, `AiOps`, `Join`, `Showcase`) and the structural ones
(`Navigation`, `Footer`, `Metadata`, `NotFound`, `Error`) are excluded —
renaming a form field or a chart axis through a CMS is risk without benefit. The
allowlist is hard-coded in `lib/i18n/page-copy-scope.ts`, not a database flag,
so widening it is a reviewed change.

**Merge point.** One place, `i18n/request.ts`:

```ts
const messages = applyPageCopy(shipped, await pageCopyOverrides(locale));
```

Every `t()` and `t.raw()` call site picks this up with no page changes.

**Three hazards shaped the implementation.**

1. *`getRequestConfig` runs during `next build`.* An unguarded database read
   there breaks the build wherever `DATABASE_URL` is absent. `pageCopyOverrides`
   never throws: a failed read caches an empty result and the shipped bundle is
   served. `tests/unit/page-copy-request-config.test.ts` asserts it with the
   repository rejecting, and the build is verified with the variable unset.
2. *Per-request cost.* Every in-scope page is statically prerendered, so the
   read happens at build and at revalidation — but `getRequestConfig` also runs
   for the four `force-dynamic` routes, which would pay a query per request for
   overrides they never use. `unstable_cache` is deprecated in favour of
   `"use cache"`, which needs the app-wide `cacheComponents` flag; neither is
   proportionate here. The loader instead uses a process-local TTL map, matching
   the pattern already used by the rate limiter and the view tracker: 30s on
   success, 5s after a failure, concurrent misses collapsed into one read, and
   an explicit clear on save. Correctness does not depend on the clear —
   `revalidatePath` is what makes an override appear.
3. *Arrays must stay arrays.* Paths reach depth 5 and mix object and index
   segments (`Home.stats.0.value`, `Privacy.sections.0.body.0`). A naive
   `{...a, ...b}` deep merge turns `sections` into an object keyed `"0"`, which
   type-checks, looks right in a debugger, and silently breaks every `t.raw()`
   consumer. `applyPageCopy` is therefore a path-walk that replaces leaves in a
   structural clone — never a generic merge — and copies only the containers
   along a changed path, preserving array-ness at each step.

**Safety rules.** An override may only replace an existing string leaf,
validated against the English bundle, so it can never add a key, change a shape
or remove a section: policy pages are editable in text but fixed in structure. A
value whose ICU placeholder set differs from the shipped one is rejected — no
in-scope string has a placeholder today, but the rule is cheap insurance. The
editor's fields are generated from the English bundle and read back by the same
derivation, so an injected field name is never read at all rather than merely
rejected downstream. Paths that do not resolve — including `__proto__` — are
dropped at merge time as a second line of defence.

**Storage.** One `page_copy` table (migration `0016_m7_page_copy`): `locale`,
`namespace`, `keyPath`, `value`, `updatedByProfileId`, timestamps, unique on
`(locale, namespace, keyPath)`. A row per locale rather than paired `En`/`Zh`
columns, because the message tree is already locale-partitioned; English may be
overridden while Chinese falls back to its bundle value, which keeps the
bundles' leaf-key parity meaningful.

Both locales are saved in one transaction, so a failure cannot leave English
overridden while Chinese silently kept its previous value. Only entries that
actually differ are written, so re-saving an untouched form is a no-op and the
`page_copy.updated` audit row records what a staff member really changed.

**Invalidation.** `lib/admin/revalidate-public-path.ts` mirrors the existing
admin guard, validating against `config/public-routes.ts` instead of the admin
regex. `pageCopyRoutes` maps each namespace to the public routes it renders on,
and a test asserts every namespace maps to a declared route — a typo there would
silently stop invalidation.

### M7.3 — Media (not started)

A `media` table plus an admin section to register and browse image references,
validated with the rule already written for showcase logos
(`isSafeLogoReference`: site-relative or `https:`, rejecting `javascript:`,
`data:` and protocol-relative). Upload via `@vercel/blob` only if the registry
proves insufficient, behind the same interface. Either way `next.config.ts`
needs explicit `images.remotePatterns` — never a wildcard — because `next/image`
rejects every remote host today.

## Invariants this milestone must not break

- Actor is the first repository argument; `requireAdmin(actor)` runs before
  parsing and before `loadDatabase()`.
- Every mutation writes an audit row inside the same transaction.
- Authorization denial becomes `notFound()`, never a 403.
- Server actions carry only serializable bound args.
- Client components never call `useTranslations`; labels are resolved
  server-side and passed as props.
- Domain error text never reaches the client.
- Only files under `lib/db/repos/` may import the database client.
- Staff and agent actors stay disjoint: no "agent drafts and publishes" path.
- `messages/en.json` and `messages/zh-HK.json` stay in leaf-key parity.
