# Task 4 report: Member 360 and transactional staff notes

## Summary

Implemented the staff-only Member 360 detail route at `/[locale]/admin/members/[id]` and append-only staff notes. The view is server-rendered, authorizes the actor both at the page and repository/service boundaries, uses `profileId` as the domain key, renders all sections when empty, and constructs Stripe dashboard links on the server from stored opaque IDs.

Notes validate `profileId` and trimmed bodies (1-4,000 characters), write the note and matching `member_note.appended` audit event in one database transaction, record the staff profile as author/auditor, and never put the note body in audit metadata or logs. Missing member records become a real `notFound()` response; the existing admin layout maps unauthorized admin access to `notFound()`.

## Files

- `lib/admin/member-360.ts`
- `lib/db/repos/admin-members.ts`
- `lib/db/repos/member-notes.ts`
- `components/admin/member-360.tsx`
- `components/admin/member-note-form.tsx`
- `app/[locale]/(admin)/admin/members/[id]/page.tsx`
- `messages/en.json`
- `messages/zh-HK.json`
- `tests/unit/member-360.test.ts`
- `tests/unit/member-notes.test.ts`

## TDD evidence

RED, before production files existed:

```text
npx.cmd vitest run tests/unit/member-360.test.ts tests/unit/member-notes.test.ts --reporter=dot
FAIL 2 suites, 0 tests collected
Failed to resolve @/lib/admin/member-360
Failed to resolve @/lib/db/repos/member-notes
```

GREEN:

```text
npx.cmd vitest run tests/unit/member-360.test.ts tests/unit/member-notes.test.ts --reporter=dot
2 passed, 9 passed
```

Focused gate:

```text
npx.cmd vitest run tests/unit/member-360.test.ts tests/unit/member-notes.test.ts tests/unit/admin-presentational.test.tsx tests/unit/messages.test.ts --reporter=dot
4 passed, 14 passed
```

## Verification

- `npm.cmd run typecheck` passed.
- `npm.cmd run lint` passed.
- `npm.cmd run audit:strings` passed (76 TSX files scanned).
- `npm.cmd test` passed: 59 files / 256 tests; 2 existing skipped tests.
- `npm.cmd run build` passed and includes dynamic `/[locale]/admin/members/[id]`.
- `git diff --check` passed before staging.
- Task 4 files were confirmed UTF-8 without BOM.

## Commits

- `fe487cc feat: add Member 360 and staff notes`

## Self-review and risks

- Reviewed actor-first authorization, runtime repository authorization, profile ownership, page/action Zod boundaries, transactional note/audit behavior, no note-body logging or audit metadata, locale parity, server component defaults, and 404 behavior.
- Build emitted the pre-existing Browserslist/caniuse-lite freshness warning only; it does not affect the Task 4 build result.
- The linked-worktree sandbox repeatedly failed to apply deny-read ACLs. `apply_patch` was attempted first; the fallback was limited to the listed Task 4 files, used BOM-free PowerShell writes, and was verified afterward.