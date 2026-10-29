# Roll back one committed member import

Use this after an `import_commit` batch has written members and you need to undo **that batch only**. The script is `scripts/rollback-member-import.ts`. It is dry-run unless `MEMBER_IMPORT_ROLLBACK_APPLY=true`. It refuses production with the same check as `MEMBER_IMPORT_MEMBERSHIP_WRITE_ENABLED`: both `MEMBER_IMPORT_ENABLED` and `MEMBER_IMPORT_MEMBERSHIP_WRITE_ENABLED` must be `true`, `VERCEL_ENV=production` is refused, and a production Node process is refused unless it is an explicit Vercel preview or development deployment. The check does not look at the database host. Point `DATABASE_URL` at the staging branch. The script uses the Neon serverless driver, so it can run where `psql` cannot reach the database. It does not send email or call Stripe. Do not point it at production.

```sh
MEMBER_IMPORT_ENABLED=true \
MEMBER_IMPORT_MEMBERSHIP_WRITE_ENABLED=true \
MEMBER_IMPORT_ROLLBACK_RUN_ID=<member_import_runs.id> \
MEMBER_IMPORT_ROLLBACK_BATCH_ID=<admin_batches.id> \
npx tsx scripts/rollback-member-import.ts
```

Add `MEMBER_IMPORT_ROLLBACK_APPLY=true` only after the dry-run counts look right. The batch must be an `import_commit` whose `selection_snapshot.payload.importRunId` is that run, and the batch actor must be the run actor.

## What a commit writes

| Table | Create (new email) | Update (existing member id) |
| --- | --- | --- |
| `contacts` | Insert, `source = import`. Stage `member` for an active membership, `closed` for expired, `new` for contact-only. | Not inserted. |
| `profiles` | Hidden shell only when a membership is written: `directory_visible = false`, `role = member`, `auth_user_id = id` (not a Neon login). | `locale` (and `updated_at`). |
| `member_operations_metadata` | Not written. | Tags and staff owner, when the file mapped them. |
| `memberships` | Insert active or expired. No Stripe customer, subscription, application, company, or grant. | Insert, or update the live row in place (an expired import prefers the live row, then an expired row). |
| `membership_plans` | `individual` / `platinum` may be inserted with `ON CONFLICT DO NOTHING` if missing. Corporate uses the existing plan. | Same bootstrap. |
| `audit_events` | `member.import.row.committed` on the contact, plus `member.import.committed` on the run when the batch completes with no failed items. | `member.import.row.committed` on the profile. |

Batch rows (`admin_batches`, `admin_batch_items`) and the staging run (`member_import_runs`, `member_import_rows`, `member_import_uploads`) stay. They are the record of what ran.

## What the script will undo

Only **succeeded create rows** for this run and this batch:

1. Inserted memberships whose audit says `membershipAction = inserted` and that have no Stripe id, application, company, or grant.
2. Contacts with `source = import` targeted by those audits.
3. Hidden profile shells that those contacts pointed at, after the contact and membership are gone (`auth_user_id = id`, `directory_visible = false`, `role = member`), and `member_operations_metadata` for that profile via cascade.
4. The `member.import.row.committed` audits for those succeeded items, and `member.import.committed` for this run and batch.
5. The run state, from `committed` back to `confirmed`, so a corrected batch can be prepared again.

It then writes one `member.import.rolled_back` audit. A second apply that finds nothing left is a no-op.

## What it will not undo

- **`membership_plans`.** Individual and platinum rows are shared catalog data. The importer cannot tell whether it inserted them. They stay.
- **Profile updates** (`target_type = profile`) and memberships with `membershipAction = updated`. The audit does not store the previous plan, status, or dates, so restoring them would be a guess. Apply stops with `MEMBER_IMPORT_ROLLBACK_UPDATE_UNSUPPORTED` and changes nothing. Repair those members in admin, or restore from a backup.
- **Dependents.** Apply stops with `MEMBER_IMPORT_ROLLBACK_DEPENDENTS` if a shell or inserted membership is referenced by contact activity, a join invite, a billing attempt, a company seat, a conversation, a note, a journey, engagement, an application, an event registration, or an event order, or if the shell has another membership. A foreign-key error also aborts the transaction.
- **Memberships that gained a Stripe id, application, company, or grant** (`MEMBER_IMPORT_ROLLBACK_MEMBERSHIP_NOT_REVERSIBLE`).
- Other batches, other runs, and admin batch history.

Order inside the transaction: lock the run and batch, re-check the guards, delete memberships, delete contacts, delete shells, delete the import audits, set the run back to `confirmed`, record the rollback audit, then commit. Any error rolls the transaction back.
