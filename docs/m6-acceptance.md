# M6 Launch Pad acceptance evidence

This record covers the isolated `codex/m6-launch-pad` branch. It does not
authorize a Production migration, seed, deployment, or shared-environment
mutation.

## Isolated seed prerequisites

Before running the seed, the operator must select an already-migrated isolated
database. `M6_ACCEPTANCE_SEED=true` is required, `DATABASE_URL` and
`DATABASE_URL_TEST` must be the same value, and the normalized database
hostname must be listed in `M6_ACCEPTANCE_DATABASE_HOST_ALLOWLIST`. The guard
rejects Production-mode execution, missing or mismatched test URLs, and an
unlisted host before opening a connection. It cannot determine whether an
allowlisted non-Production host is isolated, so that remains an operator
responsibility.

```powershell
$env:DATABASE_URL = "<isolated-branch-url>"
$env:DATABASE_URL_TEST = $env:DATABASE_URL
$env:M6_ACCEPTANCE_DATABASE_HOST_ALLOWLIST = "<isolated-branch-host>"
$env:M6_ACCEPTANCE_SEED = "true"
$env:NODE_ENV = "test"
npm.cmd run db:migrate
npm.cmd run db:seed:m6
```

The seed reconciles only the `m6-launch-pad-acceptance-v1` fixture scope under
an advisory lock. Do not put a populated URL, hostname, account, or credential
in this document, shell history, logs, or source control. Do not use a shared
or Production database; the Production check is enforced, while confirming a
non-Production host is not shared is the operator's responsibility.

## Funding picker fixtures

Run each route with the five query parameters below. Every query returns the
five configured schemes and marks exactly the expected ID as potentially
eligible; the result remains informational and links to the corresponding
official funding source.

| Expected ID | Query parameters |
| --- | --- |
| `bud` | `sector=trade&stage=business-registered-non-subvented&market=covered-economy&employees=standard&revenue=under-100m` |
| `nittp` | `sector=advanced-training&stage=business-registered-non-subvented&market=hong-kong&employees=trainee-hk-pr&revenue=under-100m` |
| `nifs` | `sector=smart-production&stage=incorporated-non-subvented&market=hong-kong&employees=standard&revenue=under-100m` |
| `nias` | `sector=ai-data-science&stage=incorporated-non-subvented&market=hong-kong&employees=standard&revenue=investment-100m-project-150m` |
| `rd-cash-rebate` | `sector=research-development&stage=incorporated-non-subvented&market=hong-kong&employees=standard&revenue=eligible-rd-expenditure` |

Check both public routes:

- `/launchpad`
- `/zh/launchpad`

Each must render the programme explainer, cohort calendar, Landing Partner map,
five-question funding picker, and any currently open cohort application form.
The public map is a curated static configuration containing only approved public
identity and market fields; it does not read the `landing_partners` database
table or expose contact, notes, or negotiation-status data.

## Durable journey demonstration

1. In an isolated seeded Preview, sign in with a test-only company owner or
   administrator and submit the open-cohort form with a target market,
   readiness answer, and consent.
2. Repeat the submission. The repository keeps one durable application for the
   cohort/company pair rather than creating a duplicate.
3. Sign in with a test-only staff account and open `/admin/cohorts` or
   `/zh/admin/cohorts`. Move the application one legal Kanban stage at a time.
   Every successful move writes `cohort_application.stage_changed` to the audit
   log with its previous and next stages.
4. Progress an application from `scale` to `graduated`. A linked published
   Showcase listing is marked server-side and displays the localized `Gone
   Global` badge on its public card and detail route.

The Playwright durable journey uses the real Next routes, server actions,
Neon Auth session, repositories, audit table, and Showcase projection. It is
credential-gated and only runs when the M6 seed guard, an allowlisted isolated
`DATABASE_URL_TEST`, and the M6 test-only member/staff accounts are present.
The required account variables are `M6_TEST_MEMBER_EMAIL`,
`M6_TEST_MEMBER_PASSWORD`, `M6_TEST_STAFF_EMAIL`, and
`M6_TEST_STAFF_PASSWORD` (the managed local server also needs the isolated
Neon Auth runtime values).
Set `M6_TEST_MEMBER_COMPANY_DISPLAY_NAME` and
`M6_TEST_GRADUATE_COMPANY_DISPLAY_NAME` to the synthetic companies mapped to
those accounts. The graduate company must also have a published Showcase
listing. The test never seeds or cleans data.

## Verification commands

The managed acceptance command starts the actual Next development server with
Webpack and is the canonical local command:

```powershell
npm.cmd run e2e -- tests/e2e/m6-launch-pad.spec.ts
npm.cmd run audit:strings
node -e "JSON.parse(require('node:fs').readFileSync('messages/en.json','utf8')); JSON.parse(require('node:fs').readFileSync('messages/zh-HK.json','utf8')); console.log('message JSON parsed')"
```

That command runs the funding contract without credentials and skips the
durable real-route journey unless all isolated M6 variables are configured.
When intentionally targeting a separately started isolated server, set
`PLAYWRIGHT_BASE_URL` to its loopback or non-Production `*.vercel.app` origin
and run the same command. Do not use a shared or Production URL.

## Fresh Task 7 verification

| Gate | Result | Evidence |
| --- | --- | --- |
| M6 deterministic Playwright | PASS | 5 passed, 1 live Preview test skipped without the three explicit M6 variables |
| Visible-string audit | PASS | 123 TSX files scanned |
| Message JSON parse | PASS | both locale message bundles parsed successfully |
| Database, Preview, or Production mutation | NONE | Task 7 performs no seed, deployment, or external-resource action |
