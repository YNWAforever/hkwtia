# Ticket email durability implementation plan

**Goal:** Keep every first ticket receipt, attendee pass, refund notice, and refund-failure notice recoverable after the financial state commits, without repeating a provider refund or blindly resending an email after the provider's idempotency window.

**Context:** `createTicketProcessor`, `refundOrder`, `processRefundSuccess`, and `processRefundFailure` currently swallow email errors after changing order state. A webhook replay then usually sees a duplicate order state and cannot retry the notice. The existing showcase lead outbox provides the lease, frozen-payload, bounded-retry, and uncertain-send patterns.

## Design

1. Add a ticket-specific outbox with one unique event key per notice. Store the order, optional seat, notice type, delivery state, frozen provider payload, attempt count, lease, first attempt, and provider response. Clear the payload after successful delivery.
2. Enqueue receipt and pass intents in the same transaction that marks an order paid. Enqueue refund-failure intent with its audit row. Enqueue staff and webhook reconciliation refund intents with the committed refund transition. A late-payment or oversold refund may only be released once the provider accepted or verified the refund.
3. Claim with `FOR UPDATE SKIP LOCKED`; render and freeze the exact request before the first provider call. Retry with the same key and bytes inside the safe deduplication window. After the safe provider window, mark uncertain and create a staff task. Definitive client errors become blocked tasks. Never infer that a timeout means the provider refused the request.
4. Drain a small batch on an authenticated scheduled route and attempt an immediate drain after each newly committed order. The schedule is the recovery mechanism when the webhook exits or an immediate send fails.
5. Suppress an unsent receipt/pass if the order is no longer paid, and an unsent refund notice if the refund subsequently failed. Keep staff resend as a separate deliberate attempt.

## Test sequence

1. Add behavior-red tests for transactional intent creation, duplicate transitions, and refund-provider ordering; run the focused tests and confirm the expected failure.
2. Add schema and migration, repository claim/settle behavior, and runner tests covering lease expiry, frozen payload, provider timeout, retry cutoff, and status supersession.
3. Wire ticket call sites and the scheduled route. Run focused tests, the full unit suite, lint, typecheck, string audit, and build. Do not apply the migration to production or send live mail in verification.

## Release gate

The outbox migration must be applied before deploying code that writes it. Existing paid/refunded orders are not bulk mailed: their past email delivery state is unknown. Operational review can decide individual resend cases.
