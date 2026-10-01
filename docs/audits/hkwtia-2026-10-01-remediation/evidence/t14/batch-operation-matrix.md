# Eight operation verification matrix

All eight operation payload variants and shared flag/role boundaries were actually exercised by the T14 focused unit suite. SQL/UI receipts are separate; a capability assertion is not evidence of its external effect.

Every row also requires `ADMIN_BATCH_ENABLED=true`. Runtime repository commit/retry, preparation and settlement recheck the registered operation and operation flags. Historical preview/status and cancellation remain readable when flags turn off. Already leased work rechecks current actor role; disabled work settles skipped rather than executing its handler. Transactions/outbox/audits remain the effect boundary.

| Operation | Role and additional flags | Preview / effect evidence now | Retry / remaining effect gate |
|---|---|---|---|
|profile_patch|staff/ExCo/superadmin; no additional flag|T13 actual fixed SQL snapshot; T14 actual13 failure cases, fencing/cancel, bilingual10-item browser update|safe transient only; uncertain/final/cancelled lease manual reconciliation; scale T21/T22|
|import_commit|admin; MEMBER_IMPORT_ENABLED|existing row decision/snapshot reviewed; source implementation retained|T15 actual import/repeat/retention suite pending|
|membership_grant|superadmin; MEMBERSHIP_GRANTS_ENABLED, MEMBERSHIP_GRANT_BATCH_ENABLED|T06 actual grant governance/legacy authorization evidence; T14 current role/flag contract|current batch effect test and approved association activation remain T22/T09|
|renewal_reminder|admin; MEMBER_COMMUNICATION_BATCH_ENABLED|T07 reviewed campaign snapshot/approval SQL and T12 enrollment SQL; Queue is separate reviewed action|queued batch success is not delivery; approved recipient/provider acceptance T22|
|profile_update_invite|admin; MEMBER_COMMUNICATION_BATCH_ENABLED|T07 reviewed campaign governance SQL; shared UI capability boundary|same Queue/consent/outbox safeguards; invitation provider acceptance T22|
|ticket_resend|admin; TICKET_RESEND_BATCH_ENABLED|strict existing seat-ID request/handler,8-operation role/flag contract|T16 actual seat/outbox/provider/race tests pending; success cannot mean delivered|
|export_members|admin; MEMBER_EXPORT_ENABLED|T14 actual preview prepared then flag-off commit denied, no file release|T15 actual private download/TTL/hostile CSV/privacy tests pending|
|export_event_attendees|admin; EVENT_ATTENDEE_EXPORT_ENABLED|existing bounded cached artifact handler retained;8-operation role/flag contract|T15 actual private artifact download/TTL/retention tests pending|

No operation is enabled in Production by this evidence. Provider acceptance, delivery, unknown outcome and DB/outbox success must not be conflated. No live member recipient, payment, refund, historical grant deletion or batch audience expansion was performed.
