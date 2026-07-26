# Task 10 Report: Automation operations console and Member 360 history

## Outcome

DONE

Task 10 adds an admin-only automation operations console, a bounded and sanitized automation dashboard contract, audited failed-only retry scheduling, bilingual navigation and page copy, and bounded Member 360 journey, WhatsApp, and active-suppression history.

## TDD evidence

Initial Task 10 RED:

```powershell
npm.cmd test -- tests/unit/automation-admin.test.ts tests/unit/automation-dashboard.test.tsx tests/unit/member-360.test.ts tests/unit/admin-presentational.test.tsx
```

Result: FAIL; all 4 requested files failed. The runnable tests reported 10 passed and 3 expected failures for missing navigation/Member 360 behavior, while the two new automation suites also failed import resolution because their production modules did not exist.

Repository/service/action GREEN:

```powershell
npm.cmd test -- tests/unit/automation-admin.test.ts
```

Result: PASS; 1 file passed; 14/14 tests passed.

Member 360 presentation RED/GREEN:

- RED: the bilingual dashboard/Member 360 render suite reported 4 passed and 2 expected failures because the journey, WhatsApp, and suppression sections were absent.
- GREEN: 6/6 after the semantic Member 360 history sections and localized labels were added.

React boundary RED/GREEN:

- RED: 5 passed and 1 expected failure because the whole dashboard carried `"use client"`.
- GREEN: 6/6 after moving `useActionState` into the retry-form leaf so the dashboard remains a server component.

Final required Task 10 command:

```powershell
npm.cmd test -- tests/unit/automation-admin.test.ts tests/unit/automation-dashboard.test.tsx tests/unit/member-360.test.ts tests/unit/admin-presentational.test.tsx
```

Result: PASS; 4 files passed; 33/33 tests passed.

## Implementation

- The dashboard repository requires a `staff`, `exco`, or `superadmin` actor before database loading and accepts only a valid explicit `asOf`, a page limit from 1 through 50, and a bounded opaque cursor.
- Dashboard counts use the same `asOf` for due and upcoming rows and report failed and processing rows separately.
- Recent jobs are capped at 10. Journey rows use deterministic `scheduled_at DESC, id DESC` keyset pagination and fetch only one bounded look-ahead row.
- Repository projections and strict DTO mapping omit profile email, phone, recipient, provider ID, message body, idempotency key, token, and raw exception text. Operational codes are character- and length-bounded.
- Retry delegates to the existing transactionally audited `journeysRepository.retryFailed` transition. Its failed-state compare-and-set fences stale, concurrent, and non-failed requests, changes only the eligible row to `scheduled`, appends one audit event, and never invokes a delivery sender.
- The Server Action validates only a UUID and supported locale, returns bounded state codes, maps authorization denial to the shared not-found boundary, revalidates the localized page, and never serializes caught errors.
- `/[locale]/admin/automations` authorizes through `requireAdminPageActor` before reading search parameters and renders localized summary cards, job health, the journey queue, retry controls, and opaque-cursor pagination.
- Navigation exposes exact English `Automations` and Traditional Chinese `自動化` labels. Page headings are exact English `Automation operations` and Traditional Chinese `自動化營運`.
- Member 360 adds exactly three target-profile queries. Each returns at most 25 newest-first journey, WhatsApp, or suppression rows with explicit sanitized projections and no per-row lookup.
- Member 360 rendering uses valid definition-list structure, semantic headings/lists/time elements, stable database identifiers as keys, and localized empty states and field labels.

## React best-practices checklist

- The route and dashboard remain server-rendered; only the retry form is a client component.
- No client fetch, effect, derived-state effect, or browser-only data loader was added.
- Server data is fetched once and passed through the exact bounded DTO.
- Tables provide captions and scoped row/column headings; summary counts use a definition list; retry feedback uses a polite live region.
- List/table rows use stable IDs or deterministic operational keys, never array indices.
- Existing invalid nested `dt`/`dd` markup in Member 360 was corrected while adding the new sections.

## Final verification

Broader admin/member/auth/i18n/automation regression:

```powershell
npm.cmd test -- tests/unit/automation-admin.test.ts tests/unit/automation-dashboard.test.tsx tests/unit/automation-retry.test.ts tests/unit/automation-repository-authorization.test.ts tests/unit/journey-repository.test.ts tests/unit/task7-lazy-admin-retry.test.ts tests/unit/member-360.test.ts tests/unit/member-notes.test.ts tests/unit/member-note-action.test.ts tests/unit/member-note-server-action-boundary.test.ts tests/unit/admin-presentational.test.tsx tests/unit/admin-page-auth.test.ts tests/unit/admin-page-auth-source.test.ts tests/unit/admin-member-page-boundary.test.ts tests/unit/admin-member-list.test.ts tests/unit/admin-members-repository.test.ts tests/unit/admin-server-action-boundaries.test.ts tests/unit/admin-repository-authorization.test.ts tests/unit/actor-authorization.test.ts tests/unit/messages.test.ts tests/unit/i18n-routing.test.ts
```

Result: PASS; 21 files passed; 118/118 tests passed.

- `npm.cmd run typecheck`: PASS, no diagnostics.
- `npm.cmd run lint`: PASS, no diagnostics.
- `npm.cmd run build`: PASS; Next.js 16 production build completed and emitted `ƒ /[locale]/admin/automations`.
- `git diff --check`: PASS; only expected Windows LF/CRLF normalization notices.

Full regression:

```powershell
npm.cmd test
```

Result: PASS; 140 files passed and 10 environment-gated files skipped; 776 tests passed and 26 skipped.

## Self-review

- Authorization is enforced independently at page, service, repository, and retry boundaries.
- Dashboard query parsing cannot trigger database work before authorization.
- Pagination is bounded, deterministic, and opaque; exact DTO key tests guard accidental payload expansion.
- Count tests verify the explicit `asOf` is bound to both due/upcoming comparisons.
- PII/provider/message/token fixtures are deliberately injected into executor results and proven absent from serialized dashboard output.
- Concurrent retry tests prove only one failed-state transition and one audit append can succeed.
- Existing source-contract tests caught and prevented Member 360 Server Action binding drift.
- Bilingual render tests cover headings, navigation, semantic tables, retry controls, Member 360 sections, and sanitized presentation.
- Pre-existing Task 1-3 report edits were preserved and excluded. The progress ledger was intentionally not modified.

## Remaining verification note

The full suite skipped 26 database/environment-gated tests because isolated services were not configured. No live PostgreSQL result is claimed; SQL-shape/executor tests, concurrency simulation, all non-gated tests, typecheck, lint, and the production build are green.

## Tool fallback

The linked Windows worktree allowed new files through `apply_patch` but denied updates to existing files with `helper_unknown_error: apply deny-read ACLs`. Existing-file changes used exact Git-applied unified diffs after path verification. Final scope and whitespace checks passed.
