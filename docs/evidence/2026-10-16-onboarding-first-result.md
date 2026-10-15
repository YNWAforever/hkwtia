# Onboarding to first useful result acceptance - 2026-10-16

## Source and operating boundary

- Branch: `codex/onboarding-first-result-20261016`.
- Base: `fa5ec0c04cbcc12077fd8b8ba288bd5279309428` (merged main).
- Work ran in the existing isolated worktree. The primary checkout remains clean.
- Database and Auth target: the user-selected Dedicated test branch, `br-super-dawn-ao919x4j`, project `fragrant-mountain-25240574`.
- The local runtime explicitly maps `DATABASE_URL` from `DATABASE_URL_TEST`. No inherited database or live Stripe credential is used.
- Application acceptance ran at `http://localhost:3011` with the real branch Auth and database. No deployment, push, migration, backfill, production write or provider email send was performed.
- Read-only remote check still found main at the base above and release at `b18990c1f7260441d127144e1d228ba5a1e6b9b7`.

## Result and implementation

The completed local journey is: authenticated new member -> save the required name -> active Community membership -> an actual eligible upcoming event -> successful RSVP, retained after reload.

Contact and company presentation details are in native optional disclosures. Existing values and consent remain visible on resume. A blank company display name becomes the validated registered name on the server. Existing actor, policy, consent and membership gates are retained.

Real new-account acceptance exposed an existing repeat-setup defect: a completed application and active membership still had `profiles.onboarding_state = 'profile'`. The validated profile save now stamps `complete`, consistent with the existing portal profile writer. Company, review and payment gates remain independent. No historical profile backfill is included.

The dashboard queries one scoped upcoming event after setup and recovery priorities are clear. With no event it queries one visible directory member. It preserves the existing entitlement, publication, consent and SQL scope predicates. RSVP/external events link to the actual registration controls, public ticketed events retain their public checkout route, and member tickets retain their private route.

Validation errors keep entered values, expand the affected optional section and focus its first invalid input. The original server action reference is retained for progressive submission. Read failures display a support reference and log only a classified code, reference and timestamp; empty content is a separate state.

## Test-first evidence

- Company display name: null, empty and whitespace inputs failed as required-field errors before the fallback; all now pass. An empty registered name still fails.
- Optional disclosures: new-user collapsed state and saved-value expansion failed before implementation.
- First result: event, directory fallback, read-failure state and event destination regressions were observed RED before their respective fixes.
- Form recovery: hidden invalid field, value reset, lost server-action identity and pending reset regressions were observed RED before their fixes.
- Profile completion: four plan-path regressions observed `profile` instead of `complete` before the marker fix.
- Safe diagnostics: four error-class cases observed missing logs before the fix; they now also check the visible reference and absence of raw exception/member data.
- Browser hit area: the first-result action measured 20px in the failing run; it now measures 50px.

## Authenticated browser and database acceptance

| Case | Evidence | Result |
| --- | --- | --- |
| English, desktop 1440px | Original new synthetic account/application resumed after the profile-state fix; original membership preserved; name-only setup; event shown; RSVP persisted after reload | PASS |
| Traditional Chinese, mobile 390px | Fresh synthetic account; actual UI profile provisioning and application creation; name-only setup; active/completed persisted states; event shown; RSVP persisted after reload | PASS |
| Startup, Traditional Chinese mobile 390px | One registered company name; stored display-name fallback equals legal name; application and membership remain pending_payment; private event remains denied | PASS |
| Error recovery | Explicit WhatsApp consent without a number rejected; name preserved; number focused; no invalid application progression | PASS |
| Mobile layout | No horizontal overflow on the tested dashboard and profile views | PASS |

The Auth accounts and event are explicitly synthetic fixtures on the isolated branch. Account signup/sign-in uses real Neon Auth. Only these newly created accounts receive an exact-row verified-email fixture; this does not prove email delivery, verification links or OAuth acceptance. No provider payment was initiated; Stripe test-mode payment acceptance is not claimed for this change.

The event and member content in unit tests is mocked. The event read, member setup and RSVP in the browser checks use the actual test database and its scoped application code. Directory fallback and diagnostic failures have unit evidence; the report does not claim a real-database empty-directory or outage acceptance run.

## Visual and accessibility checks

- Desktop English and mobile Traditional Chinese first-result action: 50px high.
- Optional contact disclosure summary: 44px high; keyboard Enter opens and closes it.
- Profile has one required field in the tested policy-disabled local configuration. Policy acceptance requirements remain feature-controlled and are not removed.
- Axe WCAG 2 A/AA and 2.1 A/AA: zero violations in the new first-result panel, both tested locales/viewports. This is a scoped result, not a full-application accessibility claim.
- Final dashboard and profile screenshots were inspected locally. All screenshots, sessions and private harness files remain ignored local artifacts.
- Server-action identity is covered at the React boundary; a JavaScript-disabled browser submission was not run.

## Review follow-up scope

The new card's measured action target and the safe-diagnostic finding are closed. Review also identified pre-existing inline `portal-button-outline` anchors on recovery/order views whose base CSS does not give them a 44px hit area. A global style change across those views is outside this onboarding patch. Additional suggested hardening is a committed assertion for the events-page anchor target, a direct `access_changed` diagnostic case, and a validated deployment revision in the diagnostic payload. The actual RSVP target and persisted action were verified in both browser flows above.

## Final local gates

| Gate | Result | Finished (UTC) |
| --- | --- | --- |
| test | PASS | 2026-10-15T19:44:50.872Z |
| lint | PASS | 2026-10-15T19:45:54.844Z |
| audit-strings | PASS | 2026-10-15T19:45:56.301Z |
| typecheck | PASS | 2026-10-15T19:46:40.324Z |
| build | PASS | 2026-10-15T19:47:38.625Z |

- Full suite: **7668 passed; 628 skipped**. The skipped credential/provider/database suites are not acceptance evidence.
- Full test command: `npm test -- --maxWorkers=4`; lint, string audit, TypeScript and production-mode webpack build also pass.
- The first build failed because the private runner supplied development NODE_ENV to a production build. The runner was corrected; product code was not changed to bypass the build.
- An earlier full run exposed an existing seat-retry test lifecycle race. The test now awaits React `act` around both simulated submissions. Idempotency, consent and retry assertions and timeout values are unchanged.
- Failed-run evidence is retained locally. The final results above come from the final source, after the fixes.
- Next.js switched the tracked generated type imports from dev to build output during the build. Those known generated edits were restored to the original source, and TypeScript was checked again.

## Release gate

No branch push or deployment has occurred, so this report contains no new CI, hosted Preview or production acceptance claim. Deployment requires the user's approval. Any later Preview must use only an explicitly isolated database/Auth configuration and a clean Git-only export; private local artifacts must not be uploaded.

## Verified source fingerprints

These hashes bind the tested source independently of the later commit containing this evidence document.

| File | SHA-256 |
| --- | --- |
| `app/[locale]/(join)/join/actions.ts` | `2b507ce2f115727ffb3920dfe9aaa2cd59ab3fdb523966b07287058920e8322e` |
| `app/[locale]/(join)/join/company/page.tsx` | `2a577df9d3079cb9c2b53ad5cfb1371034c7b4aa5c4fa7df70a646e91458fcc2` |
| `app/[locale]/(join)/join/profile/page.tsx` | `ab2f06a98baf4d964e3f3a42036ce51ffe4107802f593c025ebe089615a98c40` |
| `app/[locale]/(member)/portal/events/page.tsx` | `2e1f827f267e7e5a5c488d291228e4d939dfe972f528aed3cf64c2b577006c3a` |
| `app/[locale]/(member)/portal/page.tsx` | `3e04b1fafb859584b42eae26a725fc46007d7f9f6a932ddb32cf0eac460eb6a5` |
| `components/join/join-form.tsx` | `ba2b69e7930527f2de1dad9e20ebb0b7ca7e7b39d3f21ba8b758f5c9215ca35d` |
| `components/portal/dashboard/first-result.tsx` | `dc8ff203759a5c0afabd472f83c05bf5b6162c18755ad7b19debdd0e2ec7d6d4` |
| `lib/portal/first-result-diagnostic.ts` | `d96c710aa2b3429b158849f79ceb67c86f6acf62fe03caf517eb027472769f17` |
| `messages/en.json` | `6268a0318382974798de90de1ff32c57b78cd6caffcb518345daa44f97e5f686` |
| `messages/zh-HK.json` | `7bf3cd87926398e2c3b95e4564a729c713b57470319d82c3e07aa0c951b014e8` |
| `tests/unit/join-actions.test.ts` | `78cc7b01c644b8775304cc2aad9ef8823a176a25a6371d85cf6fe960985c2317` |
| `tests/unit/join-form-recovery.test.tsx` | `86d2cc3aae9aaabc60d567914621290e3d6b8e0fce108395fd80a87ff48b73ea` |
| `tests/unit/join-invite-prefill-pages.test.tsx` | `a372f8daab6584c1fdfe81d9151664753e803c73330815c424d427ec186a0ec1` |
| `tests/unit/portal-dashboard-page.test.tsx` | `7d9d9d22cfc90e81cdfcb07cf0a8af7bb88e12ae142ad649c372b7dc458c775c` |
| `tests/unit/portal-seat-bulk-ui.test.tsx` | `5d7f827d3b218be1078ebaa35c286a9a656c34b343fb62711f16dc4f3bcb6cc6` |
