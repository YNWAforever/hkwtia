# Finding status

T00 initial classification, 2026-09-27 Asia/Hong_Kong. The remote and feature branch are at the audit SHA, so source-backed findings have no intervening fix to credit. `open` is an implementation state; `needs-runtime` means the audit's production claim cannot be confirmed from source. Later entries must distinguish code, staging, and live evidence.

| ID | Task | Initial classification | Status | Current evidence / remaining proof |
|---|---|---|---|---|
| F01 | T01 | still-present | code-verified; browser fixture blocked | Validation now runs before env/transport, with field errors, retained input, safe error IDs and committed-registration confirmation recovery. Four focused unit files pass (15 tests). Local browser cases skipped because no open RSVP fixture; deployed cause and staging retest remain. |
| F02 | T06 | still-present | open | `member-table.tsx` has no detail link. |
| F03 | T03 | still-present | open | `eventFormInput` lacks `externalRegistrationUrl`; offline reproduction confirmed. |
| F04 | T02 | still-present | open | Ticket write path lacks visibility and membership authorization; offline stub accepted private modes. |
| F05 | T05 | still-present | open | Membership cancellation returns to auto-redirecting checkout GET. |
| F06 | T08 | still-present | open | Guest branch has no staff check-in. |
| F07 | T09 | still-present | open | Event cancellation lacks durable free RSVP notification. |
| F08 | T04 | still-present | open | Seat parser drops blank rendered rows; offline reproduction returned one of three. |
| F09 | T05 | still-present | open | Completion status has no bounded owner-only refresh. |
| F10 | T07 | still-present | open | Join GET creates new application without a supplied application ID. |
| F11 | T12–T16 | still-present | open | Member workspace lacks selection, import, and batch workflow; existing segments/campaigns are retained. |
| F12 | T06/T12 | still-present | open | List and detail choose representative memberships by different order. |
| F13 | T06 | still-present | open | Member 360 reads RSVP history but no buyer-linked ticket orders. |
| F14 | T11 | still-present | open | Member histories include unbounded reads. |
| F15 | T11 | still-present | open | Event detail loads all events and full attendee/order collections. |
| F16 | T10 | needs-runtime | open | Demo event was historically visible; source lacks an event demo publication guard. Current production rows and links need read-only verification. |
| F17 | T10 | still-present | open | Public entry points mix `/members` and `/showcase`; historical browser snapshot supports this. |
| F18 | T10 | needs-runtime | open | Current copy/catalog and association policy source must be reconciled before FAQ commitments. |
| F19 | T10 | still-present | open | Event lifecycle and registration labels are conflated; historical upcoming event showed ongoing. |
| F20 | T10 | still-present | open | Login surface lacks navigation/support context in source and historical snapshot. |
| F21 | T17 | still-present | open | Homepage uses `force-dynamic` and waits for all section reads. Historical proxy timing is not user performance evidence. |
| F22 | T15 | still-present | open | Comp form has no reason/validity/target; future bulk/company policy remains unapproved. |
| F23 | T04/T16 | still-present | open | Checkout lacks quantity integrity, total and durable recovery; ticket resend bulk depends on T13. |
| F24 | T17 | still-present | open | RSVP/ticket rate limit is process-local; abuse incidence and suitable hold ceiling are unmeasured. |
| F25 | T00/T09/T13/T17/T18 | needs-runtime | open | CI exists, but deployment SHA, staging payment journeys, worker health and production monitoring are unverified. |

No finding is marked `already-fixed` at T00. Historical CODE/REPRO evidence does not establish a production incident; historical LIVE evidence does not establish today's deployment SHA. Update each row with commit, focused test, DB/browser result, and release environment as work lands.
