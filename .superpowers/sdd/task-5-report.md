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

## Review fixes and verification

Review RED:

```text
npm.cmd test -- tests/unit/email-catalog.test.ts tests/unit/email-render-snapshots.test.tsx tests/unit/unsubscribe.test.ts tests/unit/repository-production-security.test.ts tests/unit/membership-lifecycle.test.ts
```

Result before the review implementation: exit 1; 13 failed and 37 passed across 5 files. The failures proved both classification downgrades were accepted, missing/blank CTAs rendered as `#`, the brand lacked a dark-mode class, hostile request origins controlled redirects, unsupported/oversized bodies were accepted, the unsubscribe capability was not locally defined, and forged unsubscribe actors reached all three representative repositories.

Review focused GREEN:

```text
npm.cmd test -- tests/unit/email-catalog.test.ts tests/unit/email-render-snapshots.test.tsx tests/unit/unsubscribe.test.ts tests/unit/repository-production-security.test.ts tests/unit/membership-lifecycle.test.ts
```

Result: exit 0; 5 files and 50 tests passed.

Covering matrix:

```text
npm.cmd test -- tests/unit/email-catalog.test.ts tests/unit/email-render-snapshots.test.tsx tests/unit/resend-transport.test.ts tests/unit/unsubscribe.test.ts tests/unit/env-contract.test.ts tests/unit/messages.test.ts tests/unit/membership-lifecycle.test.ts tests/unit/repository-production-security.test.ts
```

Result: exit 0; 8 files and 64 tests passed.

Review typecheck:

```text
npm.cmd run typecheck
```

Result: exit 0.

Review targeted lint:

```text
.node_modules\.bin\eslint.cmd app/api/unsubscribe/route.ts lib/db/repos/companies.ts lib/db/repos/memberships.ts lib/db/repos/profiles.ts lib/db/repos/suppressions.ts lib/email/catalog.ts lib/email/components/email-layout.tsx lib/email/render.tsx lib/membership/lifecycle.ts tests/unit/email-catalog.test.ts tests/unit/email-render-snapshots.test.tsx tests/unit/membership-lifecycle.test.ts tests/unit/repository-production-security.test.ts tests/unit/unsubscribe.test.ts
```

Result: exit 0 with no output.

Review full suite:

```text
npm.cmd test
```

Result: exit 0; 113 files passed and 8 environment-gated files skipped; 577 tests passed and 20 skipped.

Review behavior now enforced:

- The global `Actor` system source and `requireSystem` are Stripe-only. The suppression repository owns a unique-symbol-branded `UnsubscribeActor` and is the only repository that accepts it.
- A cast `{kind: "system", source: "unsubscribe"}` is rejected before database access by representative memberships, profiles, and companies repository reads.
- Only `lapsed_survey` may change its catalogue classification; attempted `campaign_generic` and `day1_video` downgrades throw `EMAIL_CLASSIFICATION_OVERRIDE_FORBIDDEN`.
- Confirmation redirects use injected/server `APP_URL`; a hostile request origin cannot control the redirect location.
- Body parsing accepts only JSON and URL-encoded forms, rejects other media with 415, and rejects bodies over 8 KiB with 413 before JSON/form parsing.
- Missing or whitespace-only CTA URLs throw `EMAIL_CTA_URL_REQUIRED`; no `#` fallback remains.
- The 13px brand text has the `email-brand` class and a dark-mode `#93c5fd` override. All 46 bilingual snapshots were intentionally refreshed.

## Comparative production dependency audit

Registry access succeeded for both the detached base `c53a4873689c194e2755a4d8ebc373469dff8f8a` and the fixed head using:

```text
npm.cmd audit --omit=dev --json
```

Both commands returned exit 1 and the same summary: 0 info, 0 low, 8 moderate, 10 high, 1 critical, 19 total. The result is not clean; these are pre-existing findings.

The comparison sorted every vulnerability record by package and compared its advisory source ID, advisory severity/range, vulnerable package severity/range, direct/effects fields, and affected node paths. Base and fixed head were identical on all fields. The advisory ID/severity set was:

```text
1102341 moderate; 1107323 low; 1107327 low; 1109131 moderate; 1109842 high;
1113465 high; 1113515 high; 1113544 high; 1113552 high; 1115541 moderate;
1115549 moderate; 1115552 high; 1115556 moderate; 1115806 high; 1115810 moderate;
1116229 moderate; 1117015 moderate; 1119052 moderate; 1120370 moderate;
1120784 moderate; 1122756 low; 1122762 high; 1122764 high; 1123525 high;
1123887 high; 1123890 high; 1123892 high; 1123893 high; 1123894 critical;
1123896 high; 1124066 high; 1124170 high; 1124171 high; 1124184 high;
1124186 moderate; 1124188 moderate; 1124190 moderate; 1124192 high;
1124194 moderate; 1124196 moderate; 1124252 high; 1124288 high;
1124303 high; 1124334 high
```

The production audit's affected node-path set was also identical:

```text
node_modules/@neondatabase/auth-ui/node_modules/@better-auth/passkey
node_modules/@esbuild-kit/core-utils
node_modules/@esbuild-kit/esm-loader
node_modules/@neondatabase/auth
node_modules/@neondatabase/auth-ui
node_modules/@neondatabase/auth-ui/node_modules/better-auth
node_modules/@neondatabase/auth/node_modules/better-auth
