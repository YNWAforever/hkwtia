# Member Portal remediation — implementation and acceptance record

Input: `HKWTIA_Member_Portal_Continuation_Evidence_2026-10-14.zip`, SHA-256 `3f1061e5afe2f99ad3b41acfac1fe82b72e828ac6959f4fa7010ec73caaecfcf`. Repository baseline: `e8254bab79cff5945da4abe995a7c075d0ce3d57`. Reviewed implementation plus fixes: `5a7600640dc522cb2df278631f0755bc777072b6`. Isolated branch: `fix/member-portal-remediation-20261015`.

This is a reviewable implementation, not release acceptance. Original UAT baseline remains **7 pass / 2 fail / 45 blocked / 6 not tested**. The 60 original cases were not rerun against a real signed-in deployment in this session. Their current results are all `not-tested`, with baseline columns preserved in `evidence/member-portal/uat-tracker.csv`.

## Delivered behavior and remaining gates

| Task | Local outcome | Outstanding acceptance/decision |
|---|---|---|
| T-MP00 | Verified isolated branch, exact upstream Git objects and lockfile install | Isolated DB, real test identities, test providers |
| T-MP01 | Deterministic membership summary; secondary payment/review issues retained; seat link bound to selected company | Actual seven-status/multi-membership sessions |
| T-MP02 | Own profile/billing/history independent of benefits; localized recoverable benefit states | Signed-in route/status matrix |
| T-MP03 | Protected member event detail; private checkout returns to recorded buyer's order; DB state controls payment display | Test-mode Stripe, webhook timing/replay, inventory concurrency |
| T-MP04 | Persisted RSVP status and own RSVP/buyer order history; SQL cursor paging | Real DB and cross-device sessions |
| T-MP05 | Named seat actions; confirmed destructive actions; immutable bulk preview; durable invitation/outbox/claims; uncertain result handling; cancel unstarted work; recent batch recovery | Apply/verify migration 0065 in isolation; SQL races and test Auth delivery/reconciliation |
| T-MP06 | Explicit company target throughout forms/actions/navigation/login continuation | Real A/B company and revoked-role sessions |
| T-MP07 | Pending, field/error focus, retained values and write-confirmed success | Browser keyboard/mobile and consent DB readback |
| T-MP08 | Existing capabilities verified; concrete A/B resource decision document | Product chooses scope; protected resource implementation if A |
| T-MP09 | SQL-bounded directory/upcoming events; both consent stores/current grants; cursor reset; request-only rendering cache; narrow client messages | Real PostgreSQL pagination/EXPLAIN, representative payload/timing samples |
| T-MP10 | Localized billing/support entry and clear checkout copy; bilingual policy matrix | Approved policy version/reference; five actual wayfinding participants |
| T-MP11 | Original failed run/LHR digest verified and raw metric summary retained | Same-condition repeated measurements, trace/root-cause diagnosis and remediation |
| T-MP12A | Local token/session integration inspected; evidence gaps documented | Versioned external tool contract and synthetic test interface |
| T-MP12B | Intentionally not implemented without contract | Confirm scope/TTL/audience/replay/revoke protocol first |
| T-MP13 | Local checks and fresh source review performed; trackers reconciled | Complete member→staff→member acceptance on one isolated deployment |

## Verification

Final code commit `5a7600640dc522cb2df278631f0755bc777072b6`:

| Check | Result |
|---|---|
| Full `npm test -- --maxWorkers=4` with JSON report | **873 files / 7,636 tests passed; 110 files / 618 tests skipped; 0 failures**; 240.77 s |
| `NODE_OPTIONS=--max-old-space-size=4096 npm run typecheck` | Passed |
| `npm run lint` | 0 errors; 72 existing warnings |
| `npm run audit:strings` | Passed; 353 TSX files scanned |
| `NODE_OPTIONS=--max-old-space-size=4096 npm run build` | Passed; 278 generated pages |

Machine-readable counts, commands, reviewed range and complete log SHA-256 values are in `evidence/member-portal/verification-summary.json`. The build-generated `next-env.d.ts` import-only change was restored to the committed baseline; no dependency or threshold was changed.

Focused evidence includes: summary 137 tests; access recovery 180; company scope 249; form feedback 111; private purchase/order 106; history 120 plus 35 existing RSVP regressions; seat batch/single integration-focused 278 with 8 real-PostgreSQL tests skipped; bounded SQL/read/render set 170 with 5 real-PostgreSQL tests skipped; copy/billing/continuation set 389. Counts overlap and must not be added into a total.

The first final full-suite run found three stale/interface regressions: tool recovery text, navigation's newly added own-history link, and unintended expansion of editable CMS keys. All were corrected without weakening token nondisclosure, route enumeration or CMS scope checks. Initial result: 870 files passed / 3 failed / 110 skipped; 7,624 tests passed / 3 failed / 618 skipped. It is not reported as a green run.

SQL compilation tests are not PostgreSQL execution. Rendered fixture HTML and jsdom interaction tests are not browser/real-session evidence. Local Chromium, Docker/PostgreSQL, test auth/Stripe and a complete public asset checkout are unavailable. No real messages, payments, refunds, seed, migration, secrets rotation, merge or production deployment occurred.

## Independent review and fixes

One fresh read-only `gpt-6-astra` review covered `e8254ba..a319284`. No Critical finding. Two Important findings and one user-flow finding were addressed in a single fix pass:

1. Same-company recent batch navigation could preserve the old `useActionState`. Batch components now remount on selected batch identity; recent batch links navigate fully, also covering reopening a previous URL after creating a new local preview. A real page-component rerender test proves displayed rows and submitted batch ID change together.
2. Single-seat revoke, role change and invitation cancellation checked benefit access before the lock, but not under it. Each now rechecks eligible company membership/grant within the existing transaction. Three withdrawal-between-preflight-and-lock tests prove no write occurs.
3. Dashboard Manage seats could choose another company's default. The link now carries the primary membership company ID; personal membership summaries do not direct to an unrelated company. This was re-graded Important from the reviewer's Minor based on user impact.

Regression sequence: 11 expected failures across four suites, then 11 suites / 87 tests passed including the fixes and related seat/dashboard/CMS/navigation cases. No deferred review minor remains. No second review is represented; final verification covers the fix commit.

## Rulings and their limits

- Use hash-verified sparse Git reconstruction through the authorized connector because Git transport has no credentials. Omitted baseline blobs remain unchanged index entries. Risk: omitted assets cannot support representative browser/Lighthouse claims. A remote tree must be based on the complete original tree and match the local final tree SHA.
- Keep T-MP identifiers and manual ledger because skill helpers expect numeric Task headings. Risk: manual bookkeeping; explicit tracker and command evidence mitigate it.
- Use `git write-tree --missing-ok` for local commits only after verifying every absent index object against baseline SHA/mode. Risk: a bad reconstruction could omit data; the helper rejects deletions/unverified entries and publication compares the full tree.
- Keep SQL compilation, fixture rendering and actual acceptance separate because required runtimes/identities are absent. Risk: release remains blocked; no integration/visual pass is inferred.
- Two old test filenames in the plan did not exist; actual matching suites and the full discovery-based suite were run. Risk: an intended scenario could still be absent, so full UAT remains necessary.
- Reviewer-set-aside T08/T10/T12B decisions stay blocked pending product/policy/tool evidence. Risk: those features remain incomplete; no invented policy or external protocol ships.
- Reviewer-set-aside migration, provider, browser and performance claims remain open. Risk: the branch cannot be treated as release-ready from source review alone.
- Known test/lint diagnosis stayed with the executor; meaningful assertions were retained, and new navigation recovery copy was excluded from CMS rather than expanding its editable surface accidentally.

## Route and deployment scope

Original fourteen portal routes remain the baseline. Three additional protected route patterns require separate fixtures: `/portal/events/[id]`, `/portal/orders/[orderId]`, `/portal/events/my`, each also under `/zh`. Seven statuses × fourteen original routes × two languages is **196 planned checks**, not 196 passes; three new route patterns make 17 portal patterns in this scope. Dynamic IDs require own, foreign and nonexistent fixtures. Server actions and any external sessions need their own negative cases.

Migration `0065_portal_seat_batches.sql` is additive (two tables plus constraints/indexes), generated with the installed Drizzle version and not applied. Before activation: recheck migration sequence against target branch, migrate an isolated DB, run full-chain migration/seed guards and the real batch/paging suites, then complete test-provider and browser journeys. Release requires explicit approval after those gates; this document does not authorize production changes.

Rollback: disable the bulk entry or revert application changes while preserving existing batch audit/data and already sent invitations. Cancel only unstarted items. Do not claim external emails were recalled. Retain additive tables until an explicit data-retention/cleanup decision; do not blindly drop migration state. Payment guards, existing billing ownership and webhook behavior remain in force.

Related records: `member-seat-batch-contract.md`, `member-resource-scope-decision.md`, `member-portal-performance.md`, `../content/member-policy-copy-matrix.md`, `../security/member-tool-contract.md`, and the implementation/UAT CSVs under `evidence/member-portal/`.
