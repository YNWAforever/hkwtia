# Finding status

T00 initial classification, 2026-09-27 Asia/Hong_Kong. The remote and feature branch are at the audit SHA, so source-backed findings have no intervening fix to credit. `open` is an implementation state; `needs-runtime` means the audit's production claim cannot be confirmed from source. Later entries must distinguish code, staging, and live evidence.

| ID | Task | Initial classification | Status | Current evidence / remaining proof |
|---|---|---|---|---|
| F01 | T01 | still-present | code-verified; browser fixture blocked | Validation now runs before env/transport, with field errors, retained input, safe error IDs and committed-registration confirmation recovery. Four focused unit files pass (15 tests). Local browser cases skipped because no open RSVP fixture; deployed cause and staging retest remain. |
| F02 | T06 | still-present | code-verified; browser gate | Member names and View links open Member 360; a validated local cursor trail returns to the filtered list and supplies previous/next links. Nine focused unit files pass (35 tests); two locale browser cases skipped without isolated M2 auth/database. |
| F03 | T03 | still-present | code-verified; browser fixture blocked | Admin create/edit now round-trip registration mode, external URL, format, online URL, tags and visibility; stale mode fields clear; public detail shows format and online location. Six focused files pass (54 tests), typecheck and bilingual string audit pass. Two locale browser cases skipped without isolated staff/event fixtures. |
| F04 | T02 | still-present | code-verified; DB and provider gate | Checkout and locked order transaction now enforce the stricter visibility/legacy flag, verify actor against buyer profile, and lock current personal or company membership before an order or Stripe session. Invite-only fails closed. 87 focused unit tests pass; three PostgreSQL tests skipped without a disposable DB. Existing open provider sessions after revocation need policy and test-mode reconciliation. |
| F05 | T05 | still-present | code-verified; browser/provider gate | Checkout GET now shows actor-scoped plan, guarded fee and status; only explicit POST resumes the existing Stripe attempt. Cancel URL stays on the local summary. Six focused files pass (55 tests); isolated Stripe/browser matrix not run. |
| F06 | T08 | still-present | open | Guest branch has no staff check-in. |
| F07 | T09 | still-present | open | Event cancellation lacks durable free RSVP notification. |
| F08 | T04 | still-present | code-verified; DB/browser gate | Selected quantity is submitted; exact attendee rows are required, extra nonempty rows rejected, and a digest-bound same-browser capability resumes the existing provider session. Focused tests pass; migration 0043 and browser flow are not run on an isolated environment. |
| F09 | T05 | still-present | code-verified; browser/provider gate | Private no-store status route reads persisted membership through billing owner/company-manager scope. Completion polls 20 times at 3-second intervals, stops on terminal/unmount, then offers manual status/support without inferring payment failure. Unit tests pass; delayed real webhook unverified. |
| F10 | T07 | still-present | open | Join GET creates new application without a supplied application ID. |
| F11 | T12–T16 | still-present | open | Member workspace lacks selection, import, and batch workflow; existing segments/campaigns are retained. |
| F12 | T06/T12 | still-present | T06 code-verified; T12 selection open | List and detail now use the same status-priority/ID order, carry selected membership/company IDs, and show all current associated memberships. The selected company comes from the selected membership, not a separate search join. Real DB proof skipped; T12 bulk scope still open. |
| F13 | T06 | still-present | code-verified; DB/browser gate | Staff Member 360 now reads bounded ticket orders by trusted `buyer_profile_id`, shows seats, check-in and refund state, and leaves unknown guest email matches unmerged. Generated-SQL/unit proof passes; two disposable PostgreSQL cases skipped with Docker unavailable. |
| F14 | T11 | still-present | open | Member histories include unbounded reads. |
| F15 | T11 | still-present | open | Event detail loads all events and full attendee/order collections. |
| F16 | T10 | needs-runtime | open | Demo event was historically visible; source lacks an event demo publication guard. Current production rows and links need read-only verification. |
| F17 | T10 | still-present | open | Public entry points mix `/members` and `/showcase`; historical browser snapshot supports this. |
| F18 | T10 | needs-runtime | open | Current copy/catalog and association policy source must be reconciled before FAQ commitments. |
| F19 | T10 | still-present | open | Event lifecycle and registration labels are conflated; historical upcoming event showed ongoing. |
| F20 | T10 | still-present | open | Login surface lacks navigation/support context in source and historical snapshot. |
| F21 | T17 | still-present | open | Homepage uses `force-dynamic` and waits for all section reads. Historical proxy timing is not user performance evidence. |
| F22 | T15 | still-present | open | Comp form has no reason/validity/target; future bulk/company policy remains unapproved. |
| F23 | T04/T16 | still-present | T04 code-verified; T16 open | Ticket form shows the server-price-derived total, date, payment nature and refund link; quantity is enforced. Recovery stores only a token digest and blocks duplicate payable sessions. T16 resend and test-mode provider acceptance remain. |
| F24 | T17 | still-present | open | RSVP/ticket rate limit is process-local; abuse incidence and suitable hold ceiling are unmeasured. |
| F25 | T00/T09/T13/T17/T18 | needs-runtime | open | CI exists, but deployment SHA, staging payment journeys, worker health and production monitoring are unverified. |

No finding is marked `already-fixed` at T00. Historical CODE/REPRO evidence does not establish a production incident; historical LIVE evidence does not establish today's deployment SHA. Update each row with commit, focused test, DB/browser result, and release environment as work lands.
