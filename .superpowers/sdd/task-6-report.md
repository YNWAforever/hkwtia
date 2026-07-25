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
