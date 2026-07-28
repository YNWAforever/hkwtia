# M4A Task 7 — Bilingual Concierge widget

## Outcome

Implemented the English and Traditional Chinese WTIA Concierge launcher and
dialog on public pages and the authenticated member portal. Join and admin
layouts remain outside the widget's scope.

The client consumes the existing Task 6 SSE contract, keeps a conversation ID
across turns, renders only React text, filters citations to HTTP(S), exposes
disabled and escalation references, retries recoverable failures, cancels
in-flight work on demand/unmount, and records one 1–5 feedback score per run.

## Design and accessibility

- Uses the existing semantic primary/secondary theme rather than introducing a
  new palette.
- Uses Radix Dialog for focus trapping, Escape close, launcher focus return,
  and accessible title/description semantics.
- Provides 44px minimum interactive targets, 3px visible focus rings, reduced
  motion-safe transitions, and viewport/safe-area constrained mobile sizing.
- At a 375px viewport, Playwright confirmed the launcher and dialog remain
  inside the viewport in both locales.
- English and `zh-HK` expose the same 25 runtime keys; the Chinese namespace is
  marked `_review: true`.

## TDD evidence

Initial RED:

```text
npm.cmd test -- tests/unit/concierge-widget.test.tsx
FAIL Cannot find module '@/components/ai/concierge-widget'
```

Final contract RED found during self-review:

```text
ConciergeWidget > shows recoverable stream errors...
Unable to find "A WTIA team member will follow up."
```

The second failure proved the Task 6 `error` event's optional `escalationId`
was being discarded. The implementation now preserves and displays that
reference while retaining retry recovery.

## Verification

- `npm.cmd test -- tests/unit/concierge-widget.test.tsx` — PASS, 8/8.
- Task 6/7 focused contracts — PASS, 5 files and 29/29 tests.
- `npm.cmd run typecheck` — PASS.
- `npm.cmd run lint` — PASS.
- `npm.cmd run build` — PASS, 92 static pages generated.
- `npm.cmd test` — PASS, 173 files and 1071 tests; 11 files / 31 tests skipped
  by their existing environment gates.
- `npm.cmd run audit:strings` — PASS, 96 TSX files scanned.
- `npm.cmd run test:e2e -- tests/e2e/concierge.spec.ts` — PASS, anonymous
  bilingual two-turn SSE continuity at 375px; authenticated member-portal case
  skipped because the M2 live environment is absent.

## Scope

No Task 8 implementation was started.
