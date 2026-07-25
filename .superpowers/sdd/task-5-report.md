# M3 Task 5 report - bilingual email delivery and unsubscribe

## Status

Implemented the Task 5 email catalogue/rendering boundary, Resend and in-memory transports, and signed one-click unsubscribe flow. No Task 6/7 runner or WhatsApp work was added.

## Dependencies

Command:

```text
npm.cmd install resend @react-email/components @react-email/render
```

Result: exit 0. The production dependency manifest and lockfile now contain:

- `@react-email/components` `^1.0.12`
- `@react-email/render` `^2.1.0`
- `resend` `^6.18.0`

The install reported 27 vulnerabilities in the complete dependency tree (2 low, 11 moderate, 13 high, 1 critical). No broad or breaking `npm audit fix` was run because dependency remediation is outside Task 5.

## RED evidence

Before any Task 5 production/template file existed:

```text
npm.cmd test -- tests/unit/email-catalog.test.ts tests/unit/email-render-snapshots.test.tsx tests/unit/resend-transport.test.ts tests/unit/unsubscribe.test.ts tests/unit/messages.test.ts
```

Result: exit 1; 4 failed suites and 1 passed suite. `messages.test.ts` passed, while the four new suites failed with the expected unresolved Task 5 imports:

```text
Failed to resolve import "@/lib/email/catalog"
Failed to resolve import "@/lib/email/transport"
Failed to resolve import "@/app/[locale]/(public)/unsubscribe/page"
```

Additional security/access RED:

```text
npm.cmd test -- tests/unit/unsubscribe.test.ts -t "authorizes the dedicated unsubscribe source"
```

Result: exit 1; the new `unsubscribe` system source was rejected by the pre-Task 5 stripe-only repository guard (`AuthorizationError: FORBIDDEN`). The production change then authorized that source only inside `suppressionsRepository`; the shared `requireSystem` guard remains stripe-only for all other automation repositories.

Additional dark-mode RED:

```text
npm.cmd test -- tests/unit/email-render-snapshots.test.tsx -t "dark-mode styles"
```

Result: exit 1; the shared layout lacked explicit dark-mode heading/body rules. The layout and message component then added `.email-heading` and `.email-copy` dark-mode overrides.

## GREEN evidence

Required focused command:

```text
npm.cmd test -- tests/unit/email-catalog.test.ts tests/unit/email-render-snapshots.test.tsx tests/unit/resend-transport.test.ts tests/unit/unsubscribe.test.ts tests/unit/messages.test.ts
```

Final result: exit 0; 5 files passed and 23 tests passed.

Snapshot command:

```text
npm.cmd test -- tests/unit/email-render-snapshots.test.tsx -u
```

Result: exit 0; 46 snapshots updated. The committed snapshot file contains one English and one `zh-HK` HTML snapshot for each of the exact 23 template IDs.

TypeScript:

```text
npm.cmd run typecheck
```

Result: exit 0.

Targeted lint:

```text
npm.cmd exec eslint -- "lib/config/env.ts" "lib/membership/lifecycle.ts" "lib/db/repos/suppressions.ts" "lib/email/**/*.ts" "lib/email/**/*.tsx" "app/api/unsubscribe/route.ts" "app/[locale]/(public)/unsubscribe/page.tsx" "tests/unit/env-contract.test.ts" "tests/unit/membership-lifecycle.test.ts" "tests/unit/email-catalog.test.ts" "tests/unit/email-render-snapshots.test.tsx" "tests/unit/resend-transport.test.ts" "tests/unit/unsubscribe.test.ts"
```

Result: exit 0 with no errors or warnings.

Full suite:

```text
npm.cmd test
```

Result: exit 0; 113 files passed and 8 environment-gated files skipped; 567 tests passed and 20 skipped.

Whitespace:

```text
git diff --check
```

Result: exit 0. Git emitted only existing line-ending notices for the unrelated Task 1-3 report edits and the previously existing suppression repository file.

## Catalogue and snapshot review

- `EMAIL_TEMPLATE_IDS` contains exactly the required 23 IDs in the approved stable order.
- Both new `Email` namespaces contain non-empty `subject`, `preview`, `heading`, `body`, and `cta` for every ID. The existing message parity test passes.
- Existing Cantonese copy outside `Email` and `Unsubscribe` was not rewritten; each bundle received only the new namespaces.
- The shared React Email document renders `lang`, `<title>`, a hidden preheader, semantic heading/link content, and explicit light/dark color rules.
- Marketing snapshots include the visible localized WTIA physical address and unsubscribe link. Transactional snapshots contain neither marketing footer copy nor unsubscribe headers.
- `lapsed_survey` accepts the actual delivery classification override because the approved journeys use the same template transactionally in dunning and as marketing in winback.

## Provider and security self-review

- Resend receives the unchanged stable `idempotencyKey` via `resend.emails.send(payload, {idempotencyKey})`.
- Provider and thrown failures become sanitized `DeliveryFailure` codes. Production code contains no logging and never places recipient, HTML/text, API key, token, or provider response text into an error.
- `createTestTransport` owns a fresh isolated in-memory send array per injected instance and has no external state.
- Production sender identity comes only from `EMAIL_FROM`; no sender domain is hard-coded or fabricated.
- Tokens are HMAC-SHA256 signatures over base64url JSON `{profileId, exp, locale}` using `CRON_SECRET`, reject malformed/expired inputs, cap token size, and compare equal-length signatures with `timingSafeEqual`.
- The API exports POST only, accepts one-click query tokens plus JSON/form confirmation inputs, and never redirects to caller-controlled URLs.
- Browser confirmation redirects only to the verified token locale and drops the token from the success URL.
- The dedicated unsubscribe actor is accepted only by the suppression repository, which performs consent update and suppression insert in one transaction and returns `created`/`existing` idempotently.

## Concerns

- The 8 full-suite skips require isolated PostgreSQL test environment values and are unchanged environment gates; no Task 5 database integration is skipped.
- The npm install audit summary remains as reported above.
- Unrelated pre-existing edits to `.superpowers/sdd/task-1-report.md`, `task-2-report.md`, and `task-3-report.md` were preserved and must stay excluded from the Task 5 commit.
