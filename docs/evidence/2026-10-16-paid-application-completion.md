# Paid application completion: isolated acceptance

Recorded: 2026-10-15T16:34:52.894Z
Source branch: codex/paid-application-completion-20261015
Base commit: 08956aefd196b89725f3c4e97c8466749366f251
Execution window: October 15-16, 2026 (Asia/Hong_Kong).

## Defect and change

A successful, correlated Stripe webhook activated the membership and completed its billing attempt, but did not complete the linked membership application. The application stayed pending_payment until a later browser resubmission repaired it.

The webhook transaction now changes only its linked pending_payment application to completed/current_step=complete when the verified transition is active. Application completion commits with entitlement, billing, lifecycle enrollment, audit, and job completion. Stale events, exact correlation, duplicate delivery, draft/review boundaries, and transaction rollback remain enforced. No migration or historical backfill is included.

A second race was reproduced: an already-prepared browser status or step-only save could arrive after activation and overwrite completion. The member application writer now preserves a completed row's status and step using CASE expressions inside the same UPDATE, with the existing ownership predicate and returned persisted row.

## Verification

- Regression RED: 5 intended failures, 3 passes on real isolated PostgreSQL before the source change.
- Browser-race RED: both late status/step saves failed against the webhook-only fix (8 passes, 2 intended failures).
- Regression GREEN: all 10 real PostgreSQL cases pass, including concurrent delivery/replay, stale activation, draft/review protection, late browser writes, completed-state preservation, and injected-write rollback/recovery.
- Existing webhook transaction tests: 12 passed.
- Full Vitest suite: 7636 passed, 0 failed, 628 skipped. Credential-gated skips are not acceptance evidence; the new database cases ran separately without skips.
- Lint: zero errors, 77 warnings. Typecheck and Next.js webpack build passed.
- Read-only code review: SQL/correlation/concurrency checks passed; the widened test-literal typing finding was corrected with as const and verified by the full TypeScript check. No remaining actionable findings.

## Browser and provider acceptance

| Flow | Browser submission and result | Provider verification | Final isolated state |
| --- | --- | --- | --- |
| Startup, English, 1440px | Required fields rejected; profile saved/resumed; company submitted; original pending checkout resumed | HKD 2,400 paid invoice; decline; authenticated 3DS; held original signed activation; exact replay duplicate | Membership cancelled after test cleanup; application completed/complete |
| Corporate, zh-HK, 390px | Required fields rejected; profile saved/resumed; company submitted; original pending checkout resumed | HKD 12,000 paid invoice; authenticated 3DS; held original signed activation; exact replay duplicate | Membership cancelled after test cleanup; application completed/complete |
| Community, English | Profile submitted through the browser | No Stripe attempt created | Membership active; application completed/complete |
| Patron, English, eligible identity | Profile submitted through the browser | No Stripe attempt created; no approval granted | Membership/application pending_review; step review |

Both paid applications completed before any later browser resubmission. Each had one membership, one completed billing attempt, one activation job with attempt_count=1, and one processed activation audit after replay. Explicit completed-application reentry returned the existing membership.

The real Stripe payment runs verified the unchanged webhook implementation before the additional browser-writer guard. On the final candidate, browser continuation and profile resubmission were repeated for all four existing applications. Completed paid applications preserved status/step despite the profile action's attempted company-step save; Community and Patron retained their expected outcomes without new memberships or payment attempts.

Guest and other-member status reads returned 404 for both new paid memberships; another signed-in member could not open either application. Messaging consent stayed unchecked.

An attempted Patron submission by the just-activated Community owner was rejected by the one-live-personal-membership constraint and created no membership. The retained draft was not transferred or bypassed. Patron review was verified using an existing eligible synthetic identity.

## Environment and cleanup

- Local app: localhost:3011; signature-preserving loopback relay: 127.0.0.1:3012.
- Neon project: fragrant-mountain-25240574; non-primary/non-default branch: br-super-dawn-ao919x4j.
- Runtime DATABASE_URL was sourced only from the host-allowlisted DATABASE_URL_TEST. Stripe runtime credentials/prices were sourced only from STRIPE_TEST_*.
- Both exact newly created TEST subscriptions were cancelled and their customers deleted. Original signed cancellations were processed; completed applications did not regress.
- Local application and Stripe listeners were stopped. Synthetic application history and immutable receipts remain on the isolated branch; no broad deletion or reset was performed.
- No production database access, live Stripe operation, migration, seed, deployment, merge, or historical backfill was performed.

## Evidence limits and retained interruptions

- Password-based test identities; public magic-link and Google OAuth not exercised.
- Policy acceptance feature remained disabled; no policy approval claimed.
- Patron was verified as pending review, not as an approved membership.
- Only new synthetic acceptance resources were retired; no production data or historical backfill.
- Initial full-run failure: the temporary runner supplied VERCEL_ENV=preview to a test that correctly permits only local deterministic acceptance. The runner environment was corrected.
- A subsequent full run timed out importing the unrelated cancelEventAction test at 20.09s, then its unfinished task affected the next case. Both implicated files passed separately (22 passed, 1 database-gated skip); the final full run is recorded separately above. Assertions and timeouts were not relaxed.
- Browser selector/validation timing interruptions and provider navigation/submission timeouts are retained. Every provider interruption was reconciled read-only; the original Checkout session and signed event were reused. No replacement payment was created.

Private local evidence contains raw signed receipts, provider diagnostics, screenshots, interrupted-run reports, and APPLICATION-ACCEPTANCE.json under .tmp/paid-application-completion-20261015 in the primary checkout. Credentials, raw receipts, and identity values are excluded from this document.

## Verified source fingerprints

- lib/db/repos/jobs.ts: SHA-256 53b76fdd3d39f39951563abbeccde82632f9047277f6f6367ef6c36039765410
- lib/db/repos/applications.ts: SHA-256 86520907da13e679ad68354bf01916407d81c47c52ac9ae781dfbd9dec4f2ef4
- tests/unit/webhook-repository-sequential.test.ts: SHA-256 f6cad03182e149d8d7229b09b6b8e6cef56c13cfc0805c608e1f44d9d8667fb8
- tests/integration/paid-application-completion.test.ts: SHA-256 e045ecda1ee75440e74e5b991372957ad39abd9c2dd1d01f861cac10da6e068a
