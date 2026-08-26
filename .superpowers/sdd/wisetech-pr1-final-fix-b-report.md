# WiseTech PR 1 Final Fix B evidence

Base: `ee89351c0dbd74f3c3375939bfb566cb884de1a5`

## Scope

`LocaleSwitcher` now serializes the current `useSearchParams()` value with `URLSearchParams.toString()` and appends it to the locale-aware router href only when non-empty. The public `LocaleSwitcher` API, labels, target-locale selection, button semantics, and styling remain unchanged. The hook consumer is contained behind an outer `Suspense` boundary for static Next.js routes; its fallback preserves the same rendered label and accessible label.

The WiseTech component inventory wording was updated because it previously described the obsolete `router.replace(pathname, {locale})` mechanism.

## TDD evidence

### RED

Command:

```text
npm.cmd test -- tests/unit/locale-switcher.test.tsx
```

Result: expected failure (2 failed, 2 passed). The English-to-Chinese and Chinese-to-English query-state examples expected serialized query values in the router href, but the current implementation called `router.replace("/events", {locale})`. Both empty-query examples passed, proving the test isolated the query-loss behavior.

### GREEN

Command:

```text
npm.cmd test -- tests/unit/locale-switcher.test.tsx
```

Result: passed (1 file, 4 tests). Coverage includes EN-to-ZH and ZH-to-EN with duplicate and encoded query values, plus both empty-query cases with no bare `?`.

## Verification

| Gate | Result |
|---|---|
| `npm.cmd test -- tests/unit/locale-switcher.test.tsx` | PASS — 4 tests |
| `npm.cmd test -- tests/unit/wisetech-route-parity.test.ts` | PASS — 15 tests |
| `npm.cmd run audit:strings` | PASS — 143 TSX files scanned |
| `npm.cmd test` | PASS — exit 0 |
| `npm.cmd run lint -- --max-warnings=0` | PASS |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run build` | PASS — only a non-blocking stale Browserslist-data notice |
| `npm.cmd audit --omit=dev --audit-level=high` | PASS — no high/critical findings; 4 moderate `esbuild` findings remain |
| `git diff --check ee89351c0dbd74f3c3375939bfb566cb884de1a5..HEAD` | PASS |
| `git diff --check ee89351c0dbd74f3c3375939bfb566cb884de1a5` | PASS — includes current working changes |

## External gates

No provider, deployment, or production actions were performed. Route parity is repository evidence only; it does not represent a preview/UAT or production approval.
