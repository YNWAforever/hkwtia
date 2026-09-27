# Staff guide for the audit remediation Preview

This guide describes the feature-flagged Preview build. It does not announce a production rollout. Use synthetic profiles and approved test recipients until the release runbook records staging acceptance and association policy decisions.

## Find a member

Open `/admin/members`. Search by name or email, then narrow by membership status, plan, company, renewal date, completeness and sort. Saved views restore a filter set; the list URL can also be shared with another authorised staff member. Open the member name or View link for Member 360. Its activity tabs load a page at a time. Return to the list to keep the filter and cursor trail. Ticket purchases are linked by the trusted buyer profile, so an unlinked guest email is not silently merged into a member record.

## Preview and run a batch

On the member list, select explicit rows or all matching rows, then inspect the batch preview before committing. The preview shows its target count, eligible/skipped/blocked reasons and a digest of the resolved selection. A filter change clears the draft selection. The progress page at `/admin/batches/[id]` records each item and can be reopened after leaving the page. Retry only failed items after reading their reason; succeeded items are not repeated. A role, membership or consent change after preview can make an item skip at execution time. The batch engine defaults off and requires `ADMIN_BATCH_ENABLED=true` in the selected test environment.

## Import members and contacts

Open `/admin/members/import` only in an isolated environment with `ADMIN_BATCH_ENABLED=true` and `MEMBER_IMPORT_ENABLED=true`. Upload a UTF-8 CSV or one-sheet XLSX up to the configured 10 MiB and 5,000-row limits. Review duplicate, invalid and conflicting rows alongside current values. Choose each row explicitly and commit the generated preview. Existing profiles update only by exact ID; contact-only rows create CRM contacts, not paid memberships. Inspect per-item outcomes and retry transient failures through the batch page. An upload is private staging, not a public file. Retention cleanup is not enabled until association policy approves it.

## Correct data, grants and ticket passes

The Preview batch correction supports limited profile metadata, locale, tags and staff owner. It cannot set a role, payment status or communication consent. Finite membership grants have their own default-off superadmin flag and require an approved policy for authority, reason and window; historical indefinite grants remain untouched. Ticket pass resend uses a separate default-off flag, queues only a still-valid paid seat and rechecks event, refund and check-in state before sending. A resend does not create a payment or change its status. The member CSV download is actor-owned, short-lived and limited to selected fields.

## Cancel events and check in attendees

For an event cancellation, inspect the member, guest, waitlist and paid-ticket counts before confirming. Cancellation creates one intent and recipient snapshot; the notification worker and real sends remain disabled until delivery policy and provider evidence are approved. Refund processing stays on the existing ticket refund path. At the check-in desk, search a member, guest registration or paid seat, confirm the selected event and state, then record admission. A second tap reports the existing attendance; cancelled, refunded, waitlisted and wrong-event records are refused. Do not clear attendance or refund rows to retry an operation.

## Escalation

If a batch item is `uncertain`, a provider result is unknown, or a webhook has not settled, pause new work and reconcile its existing key and provider record before retrying. Record the batch ID, item ID, environment and deployment SHA without copying member data or secrets into a ticket. See `release-runbook.md` for migration order, flags and rollback.

### Explicit grants and corrections

When the approved environment enables the capability, a superadmin can open Membership grants from the member workspace. Choose profile or company targets, paste trusted IDs one per line and enter a plan, Hong Kong start/expiry time and reason. The worker resolves names and conflicts into the existing durable preview; inspect every target before committing. Company and bulk activation each require their own approval. No Stripe charge or payment record is created.

For selected members, choose the correction field before previewing. Tags replace the existing tag list; an empty list clears it. Responsible staff is a current staff selector, with an explicit Unassigned option. Other fields stay outside that correction. Preview and execution both enforce server-side eligibility and current versions.
