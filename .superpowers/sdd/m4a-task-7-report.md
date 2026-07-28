# M4A Task 7 — Bilingual Concierge widget

## Outcome

Implemented the English and Traditional Chinese WTIA Concierge launcher and
dialog on public pages and the authenticated member portal. Join and admin
layouts remain outside the widget's scope.

The client consumes the existing Task 6 SSE contract, keeps a conversation ID
across turns, renders only React text, filters citations to HTTP(S), exposes
disabled and escalation references, retries recoverable pre-tool failures,
cancels in-flight work on demand/unmount, and records one 1–5 feedback score
per run.

An SSE error carrying a server-owned `escalationId` is terminal: the reference
remains visible and the email, message, and send controls lock. Both user and
programmatic submissions are refused after that terminal handoff.

The initial turn can include an optional fallback contact email. The route
strictly validates and normalizes it into the distinct
`fallbackContactEmail` service field. It is used only when the Concierge is
disabled to populate the staff-task contact email and context. It is never
promoted to confirmed identity, exposed to tools/providers, copied into an
email draft or raw audit event, or rendered in the transcript. Enabled turns
ignore it.

## Design and accessibility

- Uses the existing semantic primary/secondary theme rather than introducing a
  new palette.
- Uses Radix Dialog for focus trapping, Escape close, launcher focus return,
  and accessible title/description semantics.
- Provides 44px minimum interactive targets, 3px visible focus rings, reduced
  motion-safe transitions, and viewport/safe-area constrained mobile sizing.
- At a 375px viewport, Playwright confirmed the launcher and dialog remain
  inside the viewport in both locales.
- The optional email input has native email metadata, autocomplete, bilingual
  privacy/helper copy, inline validation, and focus-on-submit error handling.
- English and `zh-HK` expose the same runtime keys; the Chinese namespace is
  marked `_review: true`. Locale parity and the example-placeholder convention
  are covered at the real path `tests/unit/messages.test.ts`.

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
was being discarded. The implementation preserves and displays that reference
while retaining retry recovery for pre-tool failures only.

Formal review added RED/GREEN coverage for form metadata, focus containment,
SSE reader cancellation, CRLF and multiline frames, split multibyte UTF-8,
scoped raw translation templates, interaction styles, and whole-document
375px overflow. A held-open stream proves its underlying source is cancelled
before the reader lock is released after dispatch failure.

Final re-review added a retry-safety RED/GREEN split: an SSE error carrying an
`escalationId` exposes no retry control and synchronously refuses later form
submissions. An error without `escalationId` remains retryable and has its own
regression.

Acceptance review then added RED/GREEN coverage for the terminal composer lock
and fallback contact boundary. The RED suite observed eight failures: enabled
controls after terminal escalation, absent email UI/copy, strict route
rejection of a valid fallback email, and missing disabled-task contact. The
GREEN suite proves initial-turn-only transport, inline validation, strict
unknown/invalid rejection, disabled-task delivery, and non-leakage on enabled
turns.

## Verification

- Focused acceptance contracts — PASS, 4 files and 40/40 tests.
- Task 6/7 regression contracts — PASS, 8 files and 57/57 tests.
- `npm.cmd run typecheck` — PASS.
- `npm.cmd run lint` — PASS.
- `npm.cmd run build` — PASS, 92 static pages generated.
- `npm.cmd test` — PASS, 174 files and 1083 tests; 11 files / 31 tests skipped
  by their existing environment gates.
- `npm.cmd run audit:strings` — PASS, 96 TSX files scanned.
- `npm.cmd run test:e2e -- tests/e2e/concierge.spec.ts` — PASS, anonymous
  bilingual two-turn SSE continuity and whole-document overflow at 375px;
  authenticated member-portal case skipped because the M2 live environment is
  absent.
- `git diff --check` — PASS.

## Scope

No Task 8 implementation was started.
