# WiseTech PR5 public journeys verification

## Record identity and scope

- Verification date: 2026-08-29 (Asia/Hong_Kong, UTC+08:00).
- Source branch: `codex/wisetech-pr5-public-journeys`.
- Source HEAD verified: `5bbc587b59b3055229e95f0c6582c6e223405e07`.
- Starting and pre-document tracked status: clean.
- Scope: local, credential-free source and browser verification for PR5 public journeys.
- Boundary: this record does not claim a migration, database connection or write, seed/import, provider action, authenticated UAT, Preview acceptance, merge, push, pull-request publication, or deployment.

All timestamps below are unambiguous ISO timestamps in Asia/Hong_Kong. Commands in the current-HEAD section were run freshly by the Task 10 verifier. Earlier task records and regression history are identified separately and are not presented as fresh runs.

## Historical Task 1-9 evidence confirmation

The ignored local implementer records `.superpowers/sdd/task-1-implementer-report.md` through `.superpowers/sdd/task-9-implementer-report.md` were inspected before current-HEAD verification. They retain the owning-task test-first and post-commit evidence. The summaries below are historical evidence, not commands rerun by this verifier.

1. Task 1, Event hero relation and lifecycle protection
   - RED: `npm.cmd test -- tests/unit/wisetech-pr5-event-hero-schema.test.ts tests/unit/event-hero-admin-and-media.test.ts` exited 1 with four intended missing-contract assertions.
   - GREEN: `npm.cmd test -- tests/unit/wisetech-pr5-event-hero-schema.test.ts tests/unit/event-hero-admin-and-media.test.ts tests/unit/admin-events.test.ts tests/unit/admin-media.test.ts tests/unit/m7-media-schema-contract.test.ts` exited 0 with 5 files and 32 tests passed. Review hardening later passed 2 files/11 tests and the affected 12-file/80-test sweep.
2. Task 2, public Event status, projections, and registration outcomes
   - RED: `npm.cmd test -- tests/unit/event-public-status.test.ts tests/unit/event-public-page.test.tsx tests/unit/event-registration-public-action.test.ts tests/unit/event-private-media-render.test.tsx tests/unit/public-event-repository.test.ts tests/unit/event-action-state.test.ts` exited 1 for the intended missing public status/action/projection behavior.
   - GREEN: `npm.cmd test -- tests/unit/event-public-status.test.ts tests/unit/event-public-page.test.tsx tests/unit/event-registration-public-action.test.ts tests/unit/event-private-media-render.test.tsx tests/unit/public-event-repository.test.ts tests/unit/admin-events.test.ts tests/unit/event-action-state.test.ts tests/unit/event-detail-seo.test.ts tests/unit/home-highlights.test.ts tests/unit/sitemap.test.ts` exited 0 with 10 files and 60 tests passed; later private-media review evidence passed 13 files/79 tests.
3. Task 3, announcements and partner wall
   - RED/GREEN command: `npm.cmd test -- tests/unit/public-layout-announcement.test.tsx tests/unit/home-partner-wall.test.tsx tests/unit/announcement.test.tsx tests/unit/homepage.test.tsx tests/unit/partner-media-locking.test.ts` first exited 1 with 2 files/3 intended failures and 20 passing tests, then exited 0 with 5 files/24 tests.
   - The review-expanded command including partner URL projection, homepage integration, regressions, and messages exited 0 with 9 files/50 tests.
4. Task 4, localized News and independent sitemap locale failure
   - RED: `npm.cmd test -- tests/unit/public-news-locale.test.ts tests/unit/news-page-locale.test.tsx tests/unit/public-posts-repository.test.ts tests/unit/sitemap.test.ts tests/unit/sitemap-milestones.test.ts` exited 1 with 2 files and 8 tests failed while 18 tests passed.
   - GREEN: the same command plus `tests/unit/home-highlights.test.ts` exited 0; the post-review record reports 6 files/40 tests passed.
5. Task 5, atomic Launch Pad repository cutover
   - RED/GREEN command: `npm.cmd test -- tests/unit/launchpad-partner-cutover.test.tsx tests/unit/audit-synthetic-content.test.ts tests/unit/m6-schema-contract.test.ts` first exited 1 for static fallback/repository/audit gaps, then exited 0 with 3 files/21 tests.
   - The historical M6 regression sweep passed 7 files/50 tests. The audit CLI `--hide` path was not run.
6. Task 6, repository-owned Membership catalog
   - RED: `npm.cmd test -- tests/unit/membership-public-catalog.test.ts tests/unit/membership-page-catalog.test.tsx tests/unit/membership-links.test.tsx tests/unit/membership-tier-content.test.ts` exited 1 with 4 files/10 tests failed and 2 tests passed.
   - GREEN: the same command plus `tests/unit/messages.test.ts` exited 0 with 5 files/41 tests; after the dynamic-rendering review fix, the exact five-file suite passed 42 tests.
7. Task 7, Showcase presentation with durable owners preserved
   - RED: `npm.cmd test -- tests/unit/wisetech-pr5-showcase-presentation.test.tsx tests/unit/m5-public-showcase.test.tsx tests/unit/showcase-page-degrades.test.tsx tests/unit/showcase-logo-render.test.tsx` exited 1 with 1 file/3 tests failed and 3 files/17 tests passed.
   - GREEN: the same four files plus `tests/unit/locale-switcher.test.tsx` exited 0 with 5 files/29 tests. The separate durable-owner preservation suite passed 5 files/29 tests.
8. Task 8, Contact launcher and the existing Concierge runtime
   - RED: `npm.cmd test -- tests/unit/contact-concierge-launcher.test.tsx tests/unit/concierge-widget.test.tsx` exited 1 because the shared event and launcher modules did not exist.
   - GREEN: `npm.cmd test -- tests/unit/contact-concierge-launcher.test.tsx tests/unit/concierge-widget.test.tsx tests/unit/concierge-layouts.test.ts tests/unit/concierge-security.test.ts` exited 0 with 4 files/28 tests initially and 4 files/29 tests after focus-restoration review fixes.
9. Task 9, bilingual credential-free browser coverage
   - Dependency gate: `npm.cmd test -- tests/unit/locale-switcher.test.tsx tests/unit/messages.test.ts tests/unit/event-private-media-render.test.tsx tests/unit/home-partner-wall.test.tsx` passed 4 files/19 tests before edits and 4 files/21 tests post-commit.
   - Updated cross-surface units passed 2 files/18 tests. `npm.cmd run test:e2e -- tests/e2e/wisetech-pr5-public-journeys.spec.ts` passed all 4 journeys post-commit. The report correctly records E2E loader/locale-cookie work as harness diagnosis, not a fabricated product RED.

## Fresh current-HEAD verification

| Exact command | Interval (HKT) | Exit | Result and material warnings |
|---|---:|---:|---|
| `npm.cmd test -- tests/unit/wisetech-pr5-event-hero-schema.test.ts tests/unit/event-hero-admin-and-media.test.ts tests/unit/event-public-status.test.ts tests/unit/event-public-page.test.tsx tests/unit/event-registration-public-action.test.ts tests/unit/event-private-media-render.test.tsx tests/unit/public-layout-announcement.test.tsx tests/unit/home-partner-wall.test.tsx tests/unit/public-news-locale.test.ts tests/unit/news-page-locale.test.tsx tests/unit/launchpad-partner-cutover.test.tsx tests/unit/membership-public-catalog.test.ts tests/unit/membership-page-catalog.test.tsx tests/unit/wisetech-pr5-showcase-presentation.test.tsx tests/unit/contact-concierge-launcher.test.tsx tests/unit/locale-switcher.test.tsx` | `2026-08-29T15:47:35.8545777+08:00` to `2026-08-29T15:47:43.5868782+08:00` | 0 | 16/16 files and 94/94 tests passed; Vitest duration 5.53s. |
| `rg -n -i "wisetech\|YNWAforever\|landing-partners\|inquiry\|remotePatterns\|body_mdx_zh_hk\|STRIPE_SECRET_KEY" app components lib config scripts tests` | `2026-08-29T15:47:59.3647781+08:00` to `2026-08-29T15:48:00.7798496+08:00` | 0 | Expected hits were classified below; the hit-producing exit is not treated as a pass by itself. |
| `npm.cmd test -- tests/unit/wisetech-pr5-event-hero-schema.test.ts tests/unit/m7-media-schema-contract.test.ts` | `2026-08-29T15:48:24.2074789+08:00` to `2026-08-29T15:48:27.9314916+08:00` | 0 | 2/2 files and 8/8 tests passed against committed schema, migration, snapshot, and journal artifacts only. No migration or database connection ran. |
| `npm.cmd run audit:strings` | `2026-08-29T15:48:37.7009023+08:00` to `2026-08-29T15:48:39.2498277+08:00` | 0 | Passed; 166 TSX files scanned. |
| `npm.cmd test` | `2026-08-29T15:48:49.5963156+08:00` to `2026-08-29T15:50:30.0843828+08:00` | 0 | 382 files passed, 15 environment-gated files skipped; 3,136 tests passed, 40 skipped; Vitest duration 98.92s. |
| `npm.cmd run lint` | `2026-08-29T15:50:46.2564624+08:00` to `2026-08-29T15:51:01.3103640+08:00` | 0 | 0 errors and 12 warnings. Warnings are in test fixtures: unused mock arguments plus test-only `<img>`/alt-rule warnings. |
| `npm.cmd run typecheck` | `2026-08-29T15:51:10.3113244+08:00` to `2026-08-29T15:51:16.7719347+08:00` | 0 | `tsc --noEmit` completed with no diagnostics. |
| `npm.cmd run build` | `2026-08-29T15:51:38.6519648+08:00` to `2026-08-29T15:52:04.0501983+08:00` | 0 | Next.js 16.3.0 Webpack production build compiled, type-checked, and generated 122/122 static pages. No build warning was emitted. |
| `npm.cmd audit --omit=dev --audit-level=high` | `2026-08-29T15:52:28.7784714+08:00` to `2026-08-29T15:52:31.0215307+08:00` | 0 | No high or critical vulnerability was reported at the required threshold. npm reported 4 moderate findings in the `esbuild`/`@esbuild-kit`/`drizzle-kit` chain and warned that its offered forced fix would install a breaking `drizzle-kit` version; no fix or install was run. |
| `npm.cmd run test:e2e -- tests/e2e/wisetech-pr5-public-journeys.spec.ts` | `2026-08-29T15:52:42.0178754+08:00` to `2026-08-29T15:53:15.7919162+08:00` | 0 | 4/4 Chromium journeys passed in 31.5s. Warnings: `NO_COLOR` was ignored because `FORCE_COLOR` was set; Browserslist data was 14 months old; Next emitted its smooth-scroll advisory. |
| `git diff --check` and `git status --short` | `2026-08-29T15:58:47.1935218+08:00` to `2026-08-29T15:58:50.7336891+08:00` | 0 | No whitespace errors; pre-document tracked status clean at the exact source HEAD above. |

### Donor, fallback, and secret classification

The exact required scan returned only these approved classes:

- `wisetech` and `YNWAforever` occur in product naming, frozen provenance/integration inventories, and tests that enforce the donor boundary.
- `landing-partners` occurs in the repository-owned admin/public route and its tests. The prohibited static files `config/landing-partners.ts` and `config/landing-partners.json` are both absent.
- `body_mdx_zh_hk` occurs in the committed schema, locale-aware repository logic, migration contracts, and tests.
- `STRIPE_SECRET_KEY` occurs in server-only environment parsing and dummy test fixtures. No value was read or printed.
- `remotePatterns` occurs in comments and policy tests. `next.config.ts` deliberately has no `images` key and no remote host allowlist.
- `inquiry` occurs only in integration/provenance test or configuration language describing the retired/non-owned flow; there is no inquiry runtime under `app`, `components`, `lib`, or `scripts`.

The narrow classification run (`2026-08-29T15:57:09.6563895+08:00` to `2026-08-29T15:57:10.4228189+08:00`, overall exit 0) produced:

- zero hits for donor runtime/asset markers (`YNWAforever/wisetech`, `WiseTechSite`, `FullInnerPages`, `ExpansionPages`, `config/landing-partners`, or static `landing-partners.ts/json`) under runtime/script paths;
- zero `inquiry` hits under runtime/script paths;
- zero localized-News English-body fallback patterns;
- zero Stripe secret names or credential-shaped values in discovered `"use client"` files;
- `False` for both prohibited static Landing Partner file paths.

This proves the requested narrow source classification. It does not assert that a string scan can validate external content rights, provider state, or deployed bytes.

### Managed development-file cleanup

Before build, `AGENTS.md` and `next-env.d.ts` matched HEAD objects `db641b22a398990032aa471fa2a7c114d2bb485e` and `ce4e94a6b10f160ee021fe18939af160d2927dcf`. The build left both unchanged.

The managed Playwright server then made only its known changes: it appended the Next agent-rules block to `AGENTS.md` and changed the two `next-env.d.ts` imports from `.next/types` to `.next/dev/types`. The exact diff was inspected. Replacement files were created through official `apply_patch` in a new ignored scratch directory; their hashes were validated against the two HEAD objects; exact resolved paths were checked to remain inside this worktree; then each file was moved nonrecursively over its target. At `2026-08-29T15:56:23.1220163+08:00` to `2026-08-29T15:56:23.3443571+08:00`, both worktree hashes again exactly matched HEAD, the two-file diff was empty, and tracked status was clean. No `git restore`, `git checkout`, or `git reset` was used.

## Prior Task 10 regression history

These are established local historical runs from `.superpowers/sdd/task-10-regression-fix-report.md`, not this verifier's fresh commands:

- The initial full suite exposed stale image-policy and page-copy contracts, while the production build rejected synchronous runtime exports in `lib/events/registration-action.ts`. Commit `508dbe9138fdc2007d45c3821e9c5e53471ecd84` fixed the production boundary and those contracts.
- Review then found that the async Server Action export guard missed local named exports, aliases, re-exports, default/export assignments, and non-function runtime values. Commit `deb80cc4dcb0877368fb89b6d4ed1192e66a8e37` hardened that guard.
- Re-review found that the actor-parameter guard did not follow local or aliased export shapes. Commit `5bbc587b59b3055229e95f0c6582c6e223405e07` closed that final actor-export-alias gap.

Two prior intermediate full-suite failures were diagnosed as load-sensitive and are not hidden:

- After the async-export guard change, a full run had three 5-second timeout/leaked-state failures (`board-reporter-service`, `homepage-partner-wall-integration`, and `homepage`). The exact three-file isolated reproduction passed 3 files/14 tests without timeout changes, and a fresh idle full run passed 382 files with 3,136 tests plus the same environment-gated skips.
- After the actor-alias guard change, the first full run had only `ci-security-contract` exceed its existing child-process deadline. Its isolated run passed 11/11 (the Auth-tree case took 3.265s) without a timeout change, and the fresh full rerun passed 382 files/3,136 tests.

The fresh current-HEAD full-suite result recorded above independently passed and therefore supersedes those intermediate outcomes for local source verification.

## Credential and external gates

A name-only preflight ran from `2026-08-29T15:57:41.5954848+08:00` to `2026-08-29T15:57:41.6306399+08:00` with exit 0. It reported `ABSENT` for `DATABASE_URL`, `DATABASE_URL_TEST`, `PLAYWRIGHT_BASE_URL`, the Neon Auth pair, Stripe secret/webhook/price IDs, the R2 account/access/secret/bucket variables, and the Turnstile site/secret pair. No value was inspected. Presence alone would not have passed any external gate.

| External gate | Status | Evidence or reason |
|---|---|---|
| Migration execution | **NOT PASSED / NOT EXECUTED** | Only committed migration artifacts and unit contracts were inspected. No migration command ran. |
| Isolated migration and rollback rehearsal | **NOT PASSED / NOT EXECUTED** | Requires separately authorized isolated infrastructure and rollback evidence. |
| Database connection or writes | **NOT PASSED / NOT EXECUTED** | No database URL was present; no connection, query, or write ran. |
| Seed/import | **NOT PASSED / NOT EXECUTED** | No seed, audit `--hide`, or import command ran. |
| Provider activation or mutation | **NOT PASSED / NOT EXECUTED** | No Stripe, R2, Neon, Auth, Turnstile, messaging, or other provider mutation ran. |
| Live content/data import | **NOT PASSED / NOT EXECUTED** | No content, partner, media, translation, Event, or Membership row was imported. |
| Authenticated Event/cohort/Showcase UAT | **NOT PASSED / NOT EXECUTED** | The four browser journeys were deliberately credential-free and performed no registration, cohort application, or Showcase introduction. |
| Production/browser-auth gate requiring credentials | **NOT PASSED / NOT EXECUTED** | Required identity/provider/test-environment credentials were absent; the credential-free E2E result does not upgrade this gate. |
| R2 delivery, revocation, and jurisdiction | **NOT PASSED / NOT EXECUTED** | Local pure-presentation fixtures proved own-origin URLs only; no R2 object or jurisdiction check ran. |
| Approved translations, content, and partner rights | **NOT PASSED / NOT EXECUTED** | Local code/message contracts are not content-owner or rights-holder approval. |
| Accessibility/Lighthouse Preview review | **NOT PASSED / NOT EXECUTED** | No Preview Lighthouse or human accessibility review ran. |
| Preview/UAT and rollback rehearsal | **NOT PASSED / NOT EXECUTED** | No Preview target, UAT owner/result, or deployed rollback rehearsal was used. |
| GitHub required checks | **NOT PASSED / NOT EXECUTED** | No PR exists for this branch, so no required-check result is available. |
| Push / pull-request publication | **NOT PASSED / NOT EXECUTED** | At `2026-08-29T15:58:47.1935218+08:00`, the branch had no upstream; read-only `git ls-remote --heads origin refs/heads/codex/wisetech-pr5-public-journeys` exited 0 with no ref, and read-only `gh pr list --repo YNWAforever/hkwtia --head codex/wisetech-pr5-public-journeys --state all --json number,state,url,headRefName,baseRefName` exited 0 with `[]`. |
| Merge | **NOT PASSED / NOT EXECUTED** | No merge command or remote integration action ran. |
| Deployment | **NOT PASSED / NOT EXECUTED** | The local production build is source evidence only; no deployment or promotion ran. |
| Production approval and observation | **NOT PASSED / NOT EXECUTED** | No production approval, change, smoke test, or observation window was authorized or performed. |

## Local conclusion

At source HEAD `5bbc587b59b3055229e95f0c6582c6e223405e07`, every required credential-free Task 10 source command passed at its stated threshold. The full unit suite retained 40 explicitly environment-gated skips, lint retained 12 test-fixture warnings, and the production audit retained 4 moderate findings. Those non-blocking local results do not upgrade any external gate in the table above.
