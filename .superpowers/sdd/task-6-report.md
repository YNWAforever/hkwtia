# Task 6 report — WOZTELL adapter and WhatsApp delivery boundary

## Scope

Implemented the provider-neutral channel contract, explicit WhatsApp template configuration, and the WOZTELL adapter only. No inbound route, persistence mutation, delivery logging, Concierge behavior, or `progress.md` change was made.

## RED evidence

Command:

```powershell
npm.cmd test -- tests/unit/woztell-adapter.test.ts tests/unit/whatsapp-delivery.test.ts
```

Result: failed as expected before production code existed. Vitest reported unresolved imports for `@/config/whatsapp-templates` and `@/lib/channels/woztell`; 2 suites failed and 0 tests were collected.

## GREEN evidence

Command:

```powershell
npm.cmd test -- tests/unit/woztell-adapter.test.ts tests/unit/whatsapp-delivery.test.ts
```

Result: PASS — 2 test files, 8 tests, 0 failures. This was repeated after encoding the required `取消` opt-out intent as `\u53d6\u6d88` to make Windows output encoding irrelevant.

Covered behavior: deterministic credential-free mock IDs; renewal D-14 request mapping; no provider call for absent opt-in/number; sanitized provider failures; STOP and `取消` normalization; and fixed-length HMAC comparison for webhook verification.

## Verification

- `npm.cmd run typecheck` — PASS.
- `npm.cmd run lint -- config/whatsapp-templates.ts lib/channels/types.ts lib/channels/woztell.ts tests/fixtures/woztell.ts tests/unit/woztell-adapter.test.ts tests/unit/whatsapp-delivery.test.ts` — PASS, no warnings.
- `npm.cmd test -- --reporter=dot` — PASS, full Vitest suite completed without test failures.
- `git diff --check` — PASS for Task 6 files.

## Files

- `config/whatsapp-templates.ts`
- `lib/channels/types.ts`
- `lib/channels/woztell.ts`
- `tests/fixtures/woztell.ts`
- `tests/unit/woztell-adapter.test.ts`
- `tests/unit/whatsapp-delivery.test.ts`

## WOZTELL assumptions

The adapter uses WOZTELL's documented Bot API: `POST https://bot.api.woztell.com/sendResponses`, bearer-token authentication, and a body with `channelId`, `recipientId`, and `response`. It treats a documented `messageEvent.messageId` as the provider ID. WOZTELL documents webhook validation as HMAC-SHA256 over the raw body with a Base64 digest in `X-Woztell-Signature`; the adapter provides verification only and does not expose an inbound route.

`wtia_renewal_d14` and `wtia_dunning_d3` are configuration names that must be created and approved in the configured WOZTELL channel with their stated ordered BODY parameters before live activation. M3 makes no claim that either template is currently approved or that a live send succeeded.

## Self-review and concerns

Reviewed the final source and tests for provider-boundary containment, credential trimming, eligibility-before-provider behavior, secret/PII-safe errors, and lack of inbound state mutation. The sole WOZTELL endpoint is confined to `lib/channels/woztell.ts`; mock mode calls no network. Existing dirty `task-1` through `task-3` report files were left untouched. The remaining external dependency is operational: channel credentials and the two explicitly named template approvals must be provisioned before live mode can send.

## Review-gap follow-up

### Test-first result

Added `tests/unit/woztell-review-gaps.test.ts` before any production edit. Its 8 new assertions passed immediately against the committed adapter, so the uncovered review behaviors required no production fix. The original Task 6 RED remains the missing-module run recorded above: 2 failing suites and 0 collected tests. For this review follow-up the new test-first run was GREEN immediately: 1 file, 8 passed tests, 0 failed, 0 skipped.

### Follow-up GREEN and verification

- `npm.cmd test -- tests/unit/woztell-adapter.test.ts tests/unit/whatsapp-delivery.test.ts tests/unit/woztell-review-gaps.test.ts` — 3 files, 16 passed tests, 0 failed, 0 skipped.
- `npm.cmd run typecheck` — PASS.
- Targeted ESLint including the new review test — PASS, no warnings.
- `npm.cmd test -- --reporter=json --outputFile=C:\tmp\hkwtia-task6-vitest.json` — 252/252 test files passed; 613 total tests; 593 passed; 0 failed; 20 skipped; 0 todo.

### Added review coverage

- Dunning D3 live POST endpoint, headers, body, configured template name, and exact variable order.
- Successful live session-message endpoint, headers, and serialized body.
- Four partial/blank credential combinations selecting deterministic mock mode with no fetch.
- Null and unsupported inbound payload normalization without state mutation.
- Malformed 2xx response handling as `provider_unclassified_failure` without response-body leakage.
