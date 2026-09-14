# Task 8 report — the gated acceptance walk and the full gate

Phase D-2, branch `feat/phase-d2-member-tools`.

## What I implemented

Created `tests/e2e/phase-d2-member-tools.spec.ts`, mirroring
`tests/e2e/phase-b2-member-directory.spec.ts`:

- Two cases per locale (`en`, `zh-HK`): the list page renders its `<h1>` read from
  `messages/<locale>.json` (`Portal.tools.title`), and the detail page returns 200 with exactly
  one `iframe` whose `src` origin is `https://content-calendar-internal.vercel.app` and whose
  `token` search param is present.
- Signs in through `signInForM2(page, "member")` only after the skip guard runs.
- Skips on `test.skip(missing.length > 0, \`Requires ${missing.join(", ")}\`)`, where
  `missing = missingM2LiveEnvironment()` returns `readonly string[]` — same gate as phase-b2.

One deviation from the brief's paste, a typo fix only: the doc comment carried a corrupted
em-dash rendered as `??` on line 39. Changed to `—`. No code or assertion differs from the brief.

## Verification

Spec collected and skipped cleanly (the M2 live environment is not configured here, as expected):

```
$ npx playwright test tests/e2e/phase-d2-member-tools.spec.ts --list
Total: 4 tests in 1 file

$ PLAYWRIGHT_BASE_URL=http://localhost:3999 npx playwright test tests/e2e/phase-d2-member-tools.spec.ts
  4 skipped
EXIT=0
```

`PLAYWRIGHT_BASE_URL` was set only to stop Playwright starting the managed `next dev` web server
for a run in which every test skips before navigation; no request was made to that URL.

### Step 2 — focused suite

```
$ npm run audit:strings   -> Visible-string audit passed (259 TSX files scanned). EXIT=0
$ npm run lint            -> 42 problems (0 errors, 42 warnings), all pre-existing. EXIT=0
$ npm run typecheck       -> EXIT=0
$ npx vitest run <8 focused files>
  Test Files  8 passed (8)
       Tests  67 passed (67)
     EXIT=0
```

### Step 3 — full gate

| Command | Result |
|---|---|
| `npm run audit:strings` | passed, exit 0 |
| `npm run lint` | 0 errors, 42 pre-existing warnings, exit 0 |
| `npm run typecheck` | passed, exit 0 |
| `npm test` | 559 files passed / 16 skipped (575); 4959 tests passed / 44 skipped (5003); exit 0 |
| `npm run build` | exit 0, **63.6s**, no `server-only` error |

The build reached `next.config.ts` (`Running next.config.ts took 60ms`) and compiled cleanly, so
the Task 2 registry's relative + type-only imports hold: no runtime pull from `lib/config/env.ts`
into the config. No `server-only` failure to report.

## Files changed

- Added `tests/e2e/phase-d2-member-tools.spec.ts` (50 lines).

Committed as `bdf983a2 test(e2e): a member opens the embedded tool with no second login`.

## Self-review findings

- **Global constraint — token never appears.** The spec asserts only
  `url.searchParams.get("token")` is non-null. No token value is read, printed, or embedded. The
  only literal is the tool origin, which is a public host already in `config/member-tools.ts`.
- **Global constraint — copy from bundles.** Both assertions that involve user-visible copy read
  `Portal.tools.title` from the message bundle, exactly as phase-b2 does. No copy is hard-coded.
- **`Bundle.lockedTitle` is declared but unused.** It matches the brief verbatim. The locked
  (Community-only) path is covered by `tests/unit/portal-tool-detail-page.test.tsx`, not this
  browser walk; the brief's doc comment explicitly records that a Community-only fixture failing
  the frame assertion is a fixture problem. Left as specified.
- **Pre-existing dirty tree left alone.** `git status` showed uncommitted changes to
  `.superpowers/sdd/task-{1..7}-report.md`, `next-env.d.ts`, and
  `tests/unit/__snapshots__/email-render-snapshots.test.tsx.snap` before I started. Only the new
  spec was staged and committed.

## Concerns

- **The spec's assertions have never been observed executing, let alone failing.** With no M2 live
  environment the guard short-circuits every case, so the only evidence available here is
  "collected (4) and skipped cleanly (exit 0)". Per this repo's test-first convention a test that
  has never failed is a claim, not evidence, and that is exactly the state of this walk. Its
  red/green proof requires an isolated M2 environment with a `member` fixture entitled to
  startup/corporate/patron and a configured `MEMBER_TOOLS_CONTENT_CALENDAR_TOKEN`; that is
  outside this task's environment by the brief's own instruction. Recommend the Phase D-2 exit
  evidence record name this explicitly rather than counting the spec as executed acceptance.
- The origin asserted in the spec is duplicated from `config/member-tools.ts` by design (the brief
  hard-codes it, and the spec cannot import a server-adjacent registry safely). A change to the
  registry origin would therefore fail this spec loudly — desirable, but it is a second copy of
  the value.

## Post-review precision fix (2026-09-14)

Review found Task 8's second case name claimed more than it proves: it said the member
"gets the tool embedded, not a second login", but the assertions only show an `iframe`
exists at the configured origin with a `token` query param �X a tool login page satisfies
that. The name will be cited as exit evidence, so it was made to state what is proven.

Also removed the unused `Bundle.lockedTitle` field, which suggested the locked
(Community-only) path was exercised here; it is covered by
`tests/unit/portal-tool-detail-page.test.tsx`.

No assertion, skip guard, or other comment changed.

### Commands and results

```
$ npx playwright test tests/e2e/phase-d2-member-tools.spec.ts --list
Listing tests:
  [chromium] ? phase-d2-member-tools.spec.ts:31:3 ? en: the member tools list renders
  [chromium] ? phase-d2-member-tools.spec.ts:38:3 ? en: an entitled member's tools page embeds the configured tool with its token
  [chromium] ? phase-d2-member-tools.spec.ts:31:3 ? zh-HK: the member tools list renders
  [chromium] ? phase-d2-member-tools.spec.ts:38:3 ? zh-HK: an entitled member's tools page embeds the configured tool with its token
Total: 4 tests in 1 file
```
