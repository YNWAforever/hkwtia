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
