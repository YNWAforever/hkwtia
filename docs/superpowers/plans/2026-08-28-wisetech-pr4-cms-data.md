# WiseTech PR4 CMS and Data Extensions Implementation Plan

> **For Codex:** execute task-by-task with the selected subagent-driven workflow. Each implementation task uses one implementer context, then an independent requirements/code review. Do not begin the next task with an open Critical or Important finding.

**Goal:** Add the exact master-row PR4 foundations—announcements, both partner authorities, secure R2 media upload, and localized news authoring—without public journey redesign, content import, provider mutation, migration execution, merge, or deployment.

**Architecture:** Extend the existing six-layer admin stack (schema -> repository -> action core -> server boundary -> client form -> guarded page). Keep every mutation actor-first and transaction-audited. Add one incremental migration per vertical slice. Use a private R2 S3 adapter, metadata-stripping image normalization, ETag-bound reads, and revocation-aware own-origin delivery.

**Tech stack:** Next.js 16 App Router, React 19, TypeScript strict, next-intl, Drizzle ORM/Neon Postgres, Zod, Cloudflare R2 via `@aws-sdk/client-s3`, `sharp`, Vitest, Testing Library, and Playwright.

**Design:** `docs/superpowers/specs/2026-08-28-wisetech-pr4-cms-data-design.md`

## Global constraints

- Work only in `C:\Users\laich\Documents\hkwtia\.worktrees\wisetech-pr4-cms-data` on `codex/wisetech-pr4-cms-data`.
- Preserve PR3 and unrelated user changes. Stage exact paths only.
- Prefer the codebase graph for discovery, but its `hkwtia` index is known stale; verify every result against the active worktree.
- Use `npm.cmd` on Windows.
- Use TDD: capture a meaningful red failure before implementation and a focused green result afterward.
- Actor authorization precedes field parsing, body reads, database access, and provider access.
- Every staff mutation writes audit evidence in the same database transaction.
- Do not run migrations/seeds or inspect/create/mutate Neon, R2, Vercel, Stripe, or other provider resources.
- Provider/Preview check status may be read only at final publication when the GitHub PR exposes it; this does not authorize dashboard/resource inspection or mutation.
- Do not add event fields, membership catalog code, inquiries, or resources in PR4. Do not import donor/demo content. Do not wire public announcements/partners/localized news or redesign public journeys.
- Generated `AGENTS.md`, `next-env.d.ts`, and snapshot EOL-only changes are restored only after exact verification that they are tool-generated noise.

---

### Task 1: Approve and freeze the PR4 written specification

**Files:**

- Create `docs/superpowers/specs/2026-08-28-wisetech-pr4-cms-data-design.md`
- Create `docs/superpowers/plans/2026-08-28-wisetech-pr4-cms-data.md`

**Steps:**

1. Review the design against the master plan, authoritative Site inventory, PR3 delivery boundary, and active repository architecture.
2. Resolve every Critical and Important finding and re-review until approved.
3. Pin these deferrals: event hero authoring/rendering and shared membership read model to PR5; join/checkout consumption to PR6; content import to PR7.
4. Run `git diff --check` and verify that only the two specification files are changed.
5. Commit exact files: `docs: approve PR4 CMS data design`.

---

### Task 2: Implement the audited announcement vertical slice

**Files:**

- Modify `lib/db/schema-core.ts`
- Create generated `drizzle/0019_wisetech_announcements.sql`
- Create generated `drizzle/meta/0019_snapshot.json`
- Modify `drizzle/meta/_journal.json`
- Modify `lib/public-shell/announcement.ts`
- Create `lib/db/repos/announcements.ts`
- Create `lib/admin/announcement-form-input.ts`
- Create `lib/admin/announcement-action-core.ts`
- Create `lib/admin/announcement-actions.ts`
- Create `components/admin/announcement-form.tsx`
- Create `app/[locale]/(admin)/admin/announcements/page.tsx`
- Create `app/[locale]/(admin)/admin/announcements/[id]/page.tsx`
- Modify admin navigation, route inventories, and both message bundles
- Create `tests/unit/wisetech-announcement-schema-contract.test.ts`
- Create `tests/unit/admin-announcements.test.ts`
- Create `tests/unit/announcement-action-state.test.ts`
- Extend `tests/unit/announcement.test.tsx`

**Steps:**

1. Write failing schema/repository tests for exact columns/checks, deny-before-load, strict length/priority/window/path validation, row locking, deterministic active selection, list cap, and audit transitions.
2. Add the schema and generate only migration `0019`, its snapshot, and journal entry.
3. Implement actor-first create/update, publish/unpublish, archive/restore, admin list/get, and bounded active projection.
4. Write failing action/form/page-guard tests, then implement localized list/detail/create/edit UI and scoped invalidation.
5. Keep `app/[locale]/(public)/layout.tsx` on `announcement={null}`.
6. Add forward/verification/rollback notes to `docs/integration/wisetech-pr4-migration-and-import.md` without executing SQL.
7. Run focused tests, visible-string audit, typecheck, and `git diff --check`.
8. Obtain independent review; fix/re-review every Critical or Important finding.
9. Commit exact files: `feat: add audited announcement CMS`.

---

### Task 3: Implement general-partner and Launch Pad partner vertical slices

**Files:**

- Modify `lib/db/schema-core.ts`
- Create generated `drizzle/0020_wisetech_partners.sql`
- Create generated `drizzle/meta/0020_snapshot.json`
- Modify `drizzle/meta/_journal.json`
- Create `lib/db/repos/partners.ts`
- Create `lib/security/https-url.ts`
- Create partner form-input, action-core, server-action, and form modules
- Create `app/[locale]/(admin)/admin/partners/page.tsx`
- Create `app/[locale]/(admin)/admin/partners/[id]/page.tsx`
- Create `lib/db/repos/landing-partners.ts`
- Create landing-partner form-input, action-core, server-action, and form modules
- Create `app/[locale]/(admin)/admin/landing-partners/page.tsx`
- Create `app/[locale]/(admin)/admin/landing-partners/[id]/page.tsx`
- Modify `lib/db/repos/media.ts` and any Showcase media-attachment path required for consistent locking
- Modify admin navigation, route inventories, and both message bundles
- Create `tests/unit/wisetech-partner-schema-contract.test.ts`
- Create partner/landing-partner repository and action-state tests
- Strengthen `tests/unit/m6-contracts.test.ts`

**Steps:**

1. Write failing schema/repository tests for typed categories, exact bounds, the shared canonical HTTPS helper (including credentials, port, query, fragment, IP, localhost, controls, bidi controls, and normalization), inclusive Hong Kong relationship dates, confirmation gates, active bilingual-alt logo requirements, bounded deterministic projections, and lifecycle audit transitions.
2. Write failing concurrency tests proving partner/Showcase references and media archive take compatible locks and a referenced asset cannot be archived.
3. Add the schema and generate only migration `0020`, its snapshot, and journal entry.
4. Implement the general partner repository/admin stack. Keep future projection fields display-safe and limits within `1..100`.
5. Write failing privacy tests proving landing-partner contact, notes, negotiation state, inactive, unsigned, unpublished, and archived rows cannot enter the future projection.
6. Implement the separate landing-partner repository/admin stack using the existing table plus publication/archive state.
7. Add all four pages to guarded navigation/inventories. The total admin-page inventory becomes 26 after Task 2 and this task.
8. Preserve the static Launch Pad runtime source. Record the atomic PR5 repository switch and config deletion.
9. Update migration/import evidence; run focused tests, string audit, typecheck, and diff check.
10. Obtain independent review; fix/re-review every Critical or Important finding.
11. Commit exact files: `feat: add audited partner CMS`.

---

### Task 4: Complete secure private-R2 upload and revocation-aware delivery

**Files:**

- Modify `package.json` and `package-lock.json` for compatible `@aws-sdk/client-s3` and `sharp` versions
- Modify `.env.example` with `R2_JURISDICTION`
- Modify `lib/db/schema-core.ts`
- Create generated `drizzle/0021_wisetech_media_upload.sql`
- Create generated `drizzle/meta/0021_snapshot.json`
- Modify `drizzle/meta/_journal.json`
- Create `lib/media/image-upload.ts`
- Create `lib/media/r2-storage.ts`
- Create/generalize a bounded-body helper without weakening existing callers
- Modify `lib/db/repos/media.ts`
- Create `lib/admin/media-upload-service.ts`
- Create `app/api/admin/media/upload/route.ts`
- Create `app/api/media/[id]/route.ts`
- Create `components/admin/media-upload-form.tsx`
- Modify existing media admin UI, route inventories, security tests, and both message bundles
- Create media schema, normalization, R2 adapter, upload service/route, and delivery route tests

**Steps:**

1. Add dependencies with `npm.cmd install --save`; inspect the exact lockfile diff and do not contact/configure R2.
2. Write failing bounded-reader tests for absent/malformed/lying lengths and the exact 4 MiB input/output cap.
3. Write failing validator tests for MIME/magic mismatch, PNG/JPEG/WebP decoding, SVG/script/animation rejection, dimension/pixel limits, the exact 255-character filename and 300-character-per-locale alt contracts (including NFC, controls, bidi controls, and path separators), focal validation, auto-orientation, and SHA-256 over normalized bytes.
4. Add an EXIF/GPS fixture and prove same-family re-encoding strips all metadata. Reject normalized output larger than 4 MiB.
5. Add the schema and generate only migration `0021`, its snapshot, and journal entry. Uploaded metadata is all-or-none and ETag is required.
6. Write failing adapter tests for lazy required-on-use configuration, `default|eu|us|fedramp` endpoint generation, invalid jurisdiction, PutObject metadata, required ETag, `GetObject IfMatch`, streamed reads, and normalized errors.
7. Implement private R2 operations with region `auto`; store SHA-256 in database and object metadata, not an unsupported ordinary PutObject full-object SHA-256 header.
8. Write failing service tests for actor-first authorization, upload -> database+audit transaction, exact normalized metadata, and best-effort delete after ETag/database failure.
9. Write failing route tests for auth-before-query/body, same-origin enforcement, generic errors, UUID/active-upload gating, ETag/length/type/SHA metadata mismatch, streamed delivery, exact `Content-Disposition: inline` without a filename parameter, `no-store`, and before/after archive 404 behavior.
10. Implement the raw-body upload and own-origin GET routes; add the upload form without removing manual registry creation.
11. Update API/total route inventories from discovery. Confirm CSP and Next remote-image configuration remain unchanged.
12. Update migration/import evidence; run focused tests, audit, lint, typecheck, build, high-severity dependency audit, and diff check.
13. Obtain independent review; fix/re-review every Critical or Important finding.
14. Commit exact files: `feat: complete secure media upload`.

---

### Task 5: Add localized news-body authoring without public cutover

**Files:**

- Modify `lib/db/schema-core.ts`
- Create generated `drizzle/0022_wisetech_localized_news.sql`
- Create generated `drizzle/meta/0022_snapshot.json`
- Modify `drizzle/meta/_journal.json`
- Modify `lib/db/repos/admin-posts.ts`
- Modify news form-input, action-core/actions, form, and both admin news pages
- Modify both message bundles
- Create `tests/unit/wisetech-localized-news-schema-contract.test.ts`
- Create `tests/unit/news-localized-bodies.test.ts`
- Modify focused admin-news/action-state tests

**Steps:**

1. Write failing tests for one nullable additive `body_mdx_zh_hk` column, preservation of null for legacy rows, both-body CMS validation, authorization before parse/load, same-transaction audit, and `buildlog`/`page` isolation.
2. Add the schema and generate only migration `0022`, its snapshot, and journal entry. Do not copy English into the Chinese field; verification SQL reports legacy news rows still requiring reviewed Chinese content.
3. Persist English through existing `body_mdx` and Chinese through `body_mdx_zh_hk`. Keep the safe structured-content renderer and hostile-input tests.
4. Do not modify `lib/db/repos/public-posts.ts`, public news routes/components, or locale selection. Add a source-boundary test pinning that work to PR5.
5. Record the missing-translation verification query and PR7 reviewed-translation import schema in the zero-row import/content manifest; do not claim row identities without an authorized database read.
6. Run focused tests, visible-string audit, typecheck, build, and diff check.
7. Obtain independent review; fix/re-review every Critical or Important finding.
8. Commit exact files: `feat: add localized news authoring`.

---

### Task 6: PR4 acceptance, review, and publication

**Files:**

- Create `docs/acceptance/wisetech-pr4.md`
- Modify documentation only for verified evidence or reviewer-required corrections

**Steps:**

1. Run all focused PR4 schema/migration/repository/action/route/security tests.
2. Run `npm.cmd run audit:strings`, `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run build`, and `npm.cmd audit --omit=dev --audit-level=high`.
3. Run credential-free Playwright route/admin-guard checks. Do not claim authenticated CMS, database, R2, Preview, or Lighthouse evidence without isolated credentials/resources.
4. Perform independent whole-PR requirements and code-quality review; fix and re-review every Critical or Important finding.
5. Record exact local commands/results, source commit, all four migrations not run, provider/jurisdiction gates, content/rights gates, rollback, and PR5/PR6/PR7 deferrals in the acceptance record.
6. Commit the acceptance record and every reviewer-required correction: `docs: record PR4 acceptance evidence`.
7. Verify a clean worktree, push the stacked branch, and open a draft PR against `codex/wisetech-pr3-institutional-pages` with the no-public-cutover boundary in the body.
8. Read GitHub-exposed CI/Vercel check status and review comments separately. Do not inspect/mutate provider resources, merge, or deploy.
9. If post-publication evidence must be persisted in the acceptance record, update it, commit, repush, and reverify local/remote head equality. Otherwise report external status without changing the committed record.
10. Verify final local/remote head equality and PR mergeability.
