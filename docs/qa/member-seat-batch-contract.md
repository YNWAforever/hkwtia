# Company seat invitation batches — T-MP05

This implementation is ready for code review; real PostgreSQL, Auth delivery and signed-in acceptance are still required before release. Migration `0065_portal_seat_batches.sql` was generated locally, inspected as additive, and **has not been applied to a database**.

## Persistence and authority

`portal_seat_batches` stores the original authenticated profile/subject, explicit company, locale, preview expiry and committed request ID. `portal_seat_batch_items` stores immutable preview recipients/roles, a stable per-item UUID, progress and the private delivery outbox. A member-facing projection selects only the batch/item reference, email, role, state and safe result code. It never selects invitation digests, delivery tokens or claims. Only current company owners/admins may read results; operations also require the original inviter's authenticated identity.

Previews support 1–50 pasted lines, with `email` or `email,role` per line. Default role is member. This is deliberately a documented paste format, not a general CSV importer. Duplicate addresses, existing members, pending invitations, invalid addresses/roles and owner-grant restrictions are shown per row. An elevated selected role requires an explicit confirmation on commit. A preview expires after 30 minutes; it never constitutes authorization or reserves capacity.

Commit accepts only the server snapshot ID, selected item IDs, request ID and role confirmation. It cannot replace recipients or roles. Repeated commits return the same committed snapshot. The actor/request ID unique index prevents another snapshot from reusing that operation. Capacity is checked at commit and for every invitation under the existing company membership lock.

The established seat service runs inside the same transaction as the batch item/outbox update. A failed outbox write rolls the invitation back. Existing pending invitations are matched by normalized address even when a resubmission chooses a different role. They are not replaced or sent again. The existing last-owner and role policies remain in the single-row seat service.

## Delivery and recovery

The existing Neon Auth magic-link invitation adapter remains the delivery mechanism; no marketing channel, template or consent policy is added. The localized acceptance callback retains the existing token/identity check. This does **not** establish that Auth's provider email template is bilingual or that delivery occurred; those are live acceptance items.

A send must first persist its `sending` claim. Each request processes at most five items with a six-second loop budget and a five-second per-send observation limit. A timeout is uncertain, even if the underlying provider call later completes. An abandoned sending claim becomes uncertain after two minutes. Neither sending nor uncertain items are automatically resent or included in retry. If storing the provider result fails, the existing claim remains, so another request cannot send the same item again. The provider's non-error response is described as accepted by the sign-in service, not delivered to the recipient's inbox.

The raw invitation capability exists only in the private outbox between reservation and settlement/cancellation; it is cleared on success, uncertainty settlement, abandoned-claim processing or cancellation. It is never in result DTOs, batch links or diagnostic logs. The acceptance email necessarily carries the existing token-gated URL. Protect the database with the existing server-only access controls.

Only pre-delivery capacity/role-policy failures can be retried, up to five preparation attempts, with the same item ID. Current permissions and capacity are rechecked. Unknown provider results require WTIA/provider reconciliation; this branch does not invent an Auth delivery-query API or pretend a fresh key is a safe retry.

The batch URL retains company and batch context across reload and sign-in. Managers can reopen the ten most recent confirmed batches on the company seats page. Processing resumes through an explicit Continue action; closing the browser does not imply that remaining invitations will be sent by a background worker. Cancellation stops pending and not-yet-started deliveries and revokes those unsent invitations transactionally. Already-started sends may complete, and their outcomes are retained even if the actor loses management access in flight.

## Required acceptance

`tests/integration/portal-seat-bulk-concurrency.test.ts` uses only a disposable loopback PostgreSQL container behind `RUN_POSTGRES_INTEGRATION=1`. It applies the exact additive migration to the relevant baseline tables and tests 5/25-seat capacity, immutable/replayed commits, concurrent reservation, outbox rollback, revocation, claim uncertainty, cancellation and cross-company scope. Container cleanup errors fail the suite. It remains skipped here because Docker is unavailable. The older `seat-capacity.test.ts` uses an in-memory mutex and is not PostgreSQL evidence.

Before release: apply all migrations in the confirmed isolated environment, execute the new integration suite, exercise two simultaneous signed-in managers, verify Auth test-recipient results and read back invitations/outbox/audit records. Test English/Chinese and phone/desktop interfaces. Confirm the provider/operator workflow for uncertain sends. No real notifications or production writes were performed while preparing this implementation.

Rollback disables the new batch entry point while preserving batch/audit and invitation rows. Cancel unstarted work through the authorized path; never delete history or imply an already-sent email was withdrawn. Deploy the additive migration before application code that reads the new tables.
