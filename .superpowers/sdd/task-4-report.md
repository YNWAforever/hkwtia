# Task 4 report — plan catalog, validation, and join orchestration

## RED

Command:

```text
npm.cmd test -- tests/unit/join-service.test.ts tests/unit/join-schema.test.ts
```

Result before implementation: exit 1. Vitest could not resolve the new
`@/lib/membership/join-schema` and `@/lib/membership/join-service` modules, so
both focused suites failed during collection with zero tests. This is the
expected missing-feature failure.

## GREEN

Focused command:

```text
npm.cmd test -- tests/unit/join-service.test.ts tests/unit/join-schema.test.ts
```

Result after implementation: exit 0, 2 test files and 7 tests passed. The
tests cover stable plan metadata, invalid plan validation, nullable draft ids,
refresh-safe application reuse, community activation, paid checkout-command
branching, and patron review branching without a Stripe call.

Full unit command:

```text
npm.cmd test -- --reporter=dot
```

Result: exit 0, 18 test files and 49 tests passed.

Static checks:

```text
npm.cmd run lint       # exit 0, no warnings
npm.cmd run typecheck  # exit 0
git diff --check       # exit 0
```

## Files

- `lib/membership/plans.ts`: stable `PLAN_CODES`, immutable plan catalog, and
  invalid-code guard through `getPlan`.
- `lib/membership/join-schema.ts`: Zod plan, draft, profile, company, and
  complete-application schemas plus inferred input types.
- `lib/membership/join-service.ts`: actor-scoped start/resume orchestration;
  anonymous plan selection returns a continuation id without persisting PII,
  while member drafts are created/reused through the applications repository.
- `lib/membership/onboarding.ts`: actor-scoped application completion and
  domain decisions for community, paid, and patron plans. Paid plans create a
  pending-payment membership and return a typed checkout command; no Stripe SDK
  or Checkout Session is created here.
- `tests/unit/join-schema.test.ts`, `tests/unit/join-service.test.ts`: focused
  contract and branch coverage with deterministic in-memory adapters.

## Self-review

- All new runtime modules are server-only and import no Stripe SDK, secrets, or
  PII-bearing logging.
- Existing actor-first repositories remain the persistence boundary; test
  adapters are confined to the unit test file.
- Repeated `applicationId` starts read the existing actor-scoped application,
  verify the selected plan, and return the persisted step without creating a
  second draft.
- Paid membership remains `pending_payment`; the returned command contains only
  opaque ids and the plan code for Task 6.
- Community activates through the membership repository domain path; patron is
  represented as `pending_review` and never reaches checkout.

## Concerns

- Anonymous plan selection returns an in-memory continuation id because the
  existing application schema requires an authenticated applicant; the next
  auth/join task must exchange that continuation for a persisted member draft.
- Static plan metadata intentionally leaves Stripe price references null; Task
  6 should resolve configured test-mode prices without adding secrets here.
- The completion service accepts optional repository adapters for deterministic
  tests; production callers should use the default actor-scoped repositories.

## Review fixes

RED command:

```text
npm.cmd test -- tests/unit/join-service-review.test.ts
```

Result before fixes: exit 1, four failures covering missing profile bootstrap,
unvalidated company targeting, missing company persistence, and a resumed
pending-payment application that lost its checkout command.

The fix adds actor-scoped profile bootstrap, validates company-plan audience
and company membership, persists the application company, and links each
membership to a unique `application_id`. Resume paths now load that durable
membership and return the same membership/checkout command instead of creating
a duplicate. The new additive migration is `drizzle/0002_rich_lester.sql`.

Post-fix verification performed by the implementer:

```text
npm.cmd test -- tests/unit/join-service.test.ts tests/unit/join-schema.test.ts tests/unit/join-service-review.test.ts
Exit code: 0
3 test files passed, 11 tests passed.

npm.cmd run lint
Exit code: 0

npm.cmd run typecheck
Exit code: 0

npx.cmd drizzle-kit check --config drizzle.config.ts
Exit code: 0

npx.cmd drizzle-kit generate --config drizzle.config.ts
Exit code: 0
No schema changes, nothing to migrate.
```

## Parent verification

After resuming the linked worktree, the parent controller reran the complete
unit suite and static gates on the final review-fix tree:

```text
npm.cmd test
Exit code: 0
19 test files passed, 53 tests passed.

npm.cmd run lint
Exit code: 0

npm.cmd run typecheck
Exit code: 0
```

## Production repository security follow-up

### RED

The inherited production-path regression test was preserved and run before
production changes:

```text
npm.cmd test -- tests/unit/repository-production-security.test.ts
Exit code: 1
1 test file failed; 2 tests failed.
```

The failures were exact reproductions: an out-of-scope company/application
membership insert resolved instead of rejecting, and `profiles.ensure`
returned default fields after overwriting an existing authored profile.

The security matrix was then expanded before implementation:

```text
npm.cmd test -- tests/unit/repository-production-security.test.ts
Exit code: 1
1 test file failed; 5 tests failed and 1 passed.
```

The additional RED cases covered application plan/company mismatch and the
missing actor-scoped application query for a member-owned membership. The
authorized insert control passed.

### GREEN

```text
npm.cmd test -- tests/unit/repository-production-security.test.ts
Exit code: 0
1 test file passed; 7 tests passed.

npm.cmd test
Exit code: 0
20 test files passed; 60 tests passed.

npm.cmd run lint
Exit code: 0

npm.cmd run typecheck
Exit code: 0

git diff --check
Exit code: 0
```

## Final review: require member application linkage

### RED

```text
npm.cmd test -- tests/unit/repository-production-security.test.ts
Exit code: 1
1 test file failed; 2 tests failed and 7 passed.
```

Both new production-repository cases failed for the expected reason: personal
and company membership creation without `applicationId` resolved and reached
the insert instead of rejecting with `FORBIDDEN`.

### GREEN

```text
npm.cmd test -- tests/unit/repository-production-security.test.ts
Exit code: 0
1 test file passed; 9 tests passed.

npm.cmd test
Exit code: 0
20 test files passed; 62 tests passed.

npm.cmd run lint
Exit code: 0

npm.cmd run typecheck
Exit code: 0

git diff --check
Exit code: 0
```

---

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
---

## Review-fix evidence: transactional rollback and bound note action

### RED

```text
npx.cmd vitest run tests/unit/member-notes.test.ts tests/unit/member-note-action.test.ts --reporter=dot
1 failed / 1 passed; 7 tests passed
Failed to resolve @/lib/admin/member-note-action
```

The rollback test runs `appendMemberNote` with no injected dependency override. It mocks the runtime database boundary with a transactional fake that stages the production repository's note and audit writes, rejects the audit insert, and commits staged rows only when the callback resolves. It asserts both committed note and audit collections remain empty.

### GREEN

```text
npx.cmd vitest run tests/unit/member-notes.test.ts tests/unit/member-note-action.test.ts tests/unit/member-360.test.ts tests/unit/admin-presentational.test.tsx tests/unit/messages.test.ts --reporter=dot
5 passed / 18 tests passed
```

The new bound action is produced by `createAppendMemberNoteAction` and used by the member-detail page. It takes the validated route profile ID and target path as closed-over inputs, ignores tampered `FormData.profileId`, has no hidden profile input, revalidates only after a successful append, returns localized validation feedback for Zod errors, and returns the generic localized `Admin.member360.noteError` state for authorization, database, foreign-key, and other write failures without exposing internals.

### Review-fix verification

- `npm.cmd run typecheck` passed.
- `npm.cmd run lint` passed.
- `npm.cmd run audit:strings` passed.
- `npm.cmd test` passed.
- `npm.cmd run build` passed.
- `git diff --check` passed before staging.
- All review-fix files were verified UTF-8 without BOM.

### Review-fix commit

- `22ecd28 fix: harden staff note action`