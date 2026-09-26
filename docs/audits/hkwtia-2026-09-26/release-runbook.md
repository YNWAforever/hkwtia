# Release runbook (draft; no production release authorized)

1. Review the final branch diff, feature flags, env names, exact migration SQL after 0042, and backward compatibility. Confirm the target database is isolated before test migration and seeds.
2. Apply additive migrations to an isolated test database, verify old/new code compatibility, repeat guarded seed, and test duplicate drafts, historical indefinite grants, existing orders and outbox rows. Record version and connection host class without credentials.
3. Deploy schema before web. New bulk/import/grant effects remain flagged off. Deploy web, then the compatible worker and cron routes; verify auth, registry, last success, oldest pending age and dead-letter visibility before internal flags open.
4. Run preview browser and Stripe test-mode journeys with test identities and recipients. Record web SHA, worker SHA, DB migration, flags and artifacts separately. Production smoke is read-only without additional authorization.
5. Roll back by closing flags and pausing new claims, recording in-flight effects, then reverting web/worker to schema-compatible versions. Keep audit, outbox, batch and payment records. Reconcile provider-accepted work; do not resend unknown outcomes blindly or drop tables.
6. Demo cleanup requires an exact dry-run ID manifest and separate approval; restore publication state from that manifest if needed, preserving registrations, orders, refunds and cancelled status.

Current state: code branch in progress; staging unverified; production unreleased.

## T02 private ticket preflight

Run a read-only mismatch inventory before private ticketing: `SELECT id, visibility, member_only FROM events WHERE member_only IS DISTINCT FROM (visibility <> 'public');` Review each row; no automatic cleanup is authorized. In Stripe test mode, exercise a member whose company seat is revoked after checkout URL creation, then resolve the provider-expiry and paid-webhook policy before enabling private ticket sales. Verify `past_due` remains eligible under the existing benefit policy.

## T04 schema and rollback gate

Apply `0043_event_checkout_recoveries` after 0042 and before the web build that imports the recovery repository. In the isolated test environment, verify one attached open session survives cancel/reload, a paid or provider-expired session is not duplicated, an unrelated member receives 404, and a provisional-cookie persistence failure cannot mint a new key after reload. Do not deploy the T04 web code before the table exists. A web rollback may leave the additive table in place; retain its rows through the provider reconciliation window. Do not delete recovery rows or expire live Stripe sessions as cleanup without separate authorization.

## T05 membership checkout return

- No new database migration or worker flag is required for T05. Deploy web after the existing billing attempt migrations and price mappings are present. Keep the existing Stripe webhook endpoint and idempotency behavior.
- In isolated staging, create an owned pending-payment application and record its membership ID as `HKWTIA_TEST_PENDING_MEMBERSHIP_ID`. Verify GET summary creates no Stripe session; explicit continue creates/resumes one session; cancel returns to summary; success stays processing until the authenticated webhook changes membership state; unauthorized status reads return 404 and `private, no-store`. Exercise decline, 3DS, webhook before/after return, replay and asynchronous success with Stripe test mode.
- Roll back the web release if summary/action/status breaks. The original Stripe session and billing attempt records remain valid; do not delete them. A web rollback restores the old GET redirect behavior, so avoid rolling back during an in-flight payment without monitoring and user communication.

## T06 staff member workspace

- T06 has no migration or worker change. Deploy the web release after the existing event-order schema is present. The new purchase read is staff-only and uses `buyer_profile_id`; no historical email matching or data backfill is included.
- In isolated staging, seed two companies and memberships for one profile with an active membership and a later-ended expired one. Verify the list and detail select the same membership and company, search/detail/return retain filters in both locales, and a personal membership never takes a company label from the search join. Create owner, other-member and unlinked guest ticket orders; confirm only owner-linked purchases show on Member 360. Verify staff note author name and audit ID.
- Roll back the web release if the staff read path fails. No schema or data rollback is required. Purchase records remain in existing tables.

## T07 join resume

- No schema migration or worker change is required. Before considering a partial uniqueness index, run this read-only duplicate inventory in an isolated copy and review IDs with their membership and billing-attempt relationships: `SELECT applicant_user_id, plan_code, company_id, count(*) AS n, array_agg(id ORDER BY updated_at DESC) AS application_ids FROM membership_applications WHERE status IN ('draft', 'pending_payment', 'pending_review') GROUP BY applicant_user_id, plan_code, company_id HAVING count(*) > 1;` Do not auto-delete or abandon historical payment/review rows.
- In isolated staging, verify two tabs and concurrent POSTs reuse one unassigned draft; distinct plan and company scopes remain separate; pending payment/review resume at their persisted step; another company member cannot continue the applicant's ID. Test a membership CTA, expired magic link followed by retry, cross-device login, and bilingual saved-state display. The unit test is not a substitute for this browser/DB walk.
- Roll back the web code if the action or saved-state page fails. Existing applications and billing attempts remain in place; no data rollback is required.

## T08 guest check-in

- No migration, flag or worker change is required. Deploy the web code after T07; preserve the existing member and paid-seat admission routes. Confirm `event_guest_registrations.checked_in_at` exists in the selected schema before deploying.
- In isolated staging, use a fresh confirmed guest registration and staff actor. Check in once, then repeat or race two taps and verify one `event.guest.checked_in` audit row. Try waitlisted, cancelled, wrong-event and cancelled-event registrations and verify no attendance/audit write. Walk the 390px list in both locales with keyboard and screen reader status, and search name, email and seat/order ID. Do not use a real member or send a real ticket email.
- Roll back the web code if admission or list behavior fails. Existing guest attendance and audit history remains immutable; do not clear `checked_in_at` to retry a release.


## T09 RSVP cancellation notices

- Apply additive migration 0044_event_cancellation_notifications after 0043 and before deploying web code that writes a cancellation intent or reads notice previews. Keep EVENT_CANCELLATION_NOTICES_ENABLED=false during schema and web rollout. Deploy the compatible worker and authenticated /api/jobs/event-notifications route; verify the */10 schedule, job auth, claim leases, oldest pending age and blocked/uncertain counts. The same release must retain existing ticket refund and ticket email workers.
- In an isolated migrated database, run the three PostgreSQL tests and stage a confirmed member, confirmed guest, waitlist guest, self-cancelled registration and paid ticket order. Verify one intent/snapshot per cancelled event, rollback on audit failure, a repeated cancel no-op, transactional suppression and hard-bounce blocking, overlap/crash recovery, and no duplicate refund or ticket notice. Use test transport or approved test recipients only. Exercise provider timeout and acceptance reconciliation with a real test-mode provider; do not equate HTTP acceptance with delivery.
- Enable real sends only after the email operator supplies and verifies the hard-bounce/invalid-address feed, approved test recipients, provider receipt shape and a manual owner for uncertain rows. There is no authority in this request to send to real members. Record web SHA, worker SHA, migration, flag, provider environment and delivery evidence separately.
- Roll back by setting the flag false first, then pausing new worker claims. Retain intent, notice, audit and provider keys; reconcile sending, accepted and uncertain rows before any replay. A compatible web rollback can leave additive 0044 tables in place. Do not delete or requeue accepted rows to make counters look clean.
