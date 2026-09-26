# Decisions and gates

- Ruling: implement against remote `main` at the audit SHA because `git ls-remote` confirms it is current. The original local `main` is older and contains unrelated untracked files; the isolated branch preserves it.
- Ruling: treat the attached plan as a design and execution specification, while the user's request controls authorization. The pack's historical source is evidence only. No production migration, cleanup, payment, refund or member message is authorized.
- Existing `isBenefitEligibleMembershipStatus` policy, permanent historical comp records, billing/idempotency, grants, consent and role rules remain authoritative. Plan numbers such as batch size, polling, TTL and retention are configurable implementation defaults, subject to current code and policy review.
- T00 found no `DATABASE_URL_TEST` or Stripe test-mode variables in the shell. Integration and browser cases that require them must report a gate rather than a pass. An isolated database host must be confirmed before migration or seeding.
- Current migration tip is 0042. All schema changes will be additive and ordered after it; no historical migration will be edited.
- Interface preflight: T02's event/eligibility projection feeds T03/T04; T06's membership summary feeds T12/T15; T09's durable delivery feeds T16; T11 pagination feeds T12; T12 selection feeds T13; T13 snapshot/worker contract feeds T14–T16; T17 touches T01/T02 rate limits; T18 verifies all. Read each producing interface before changing its consumers.

## Policy inputs still needed

- Association-approved FAQ/refund/invoice/company-seat/approval wording and legal name.
- Authority for new bulk/company/time-bounded membership grants and their approval roles.
- Test identities, isolated database, Stripe test mode and authorized test recipients for external acceptance.

These gates do not block independent code and unit-test work.

## T02 ticket policy

- The existing benefit policy remains `active`, `past_due`, or `cancel_at_period_end`. A private ticket checkout checks the buyer's current personal membership or an unrevoked company seat in the event-locked order transaction. This is a buyer eligibility rule; there is no approved per-attendee membership rule in the event model. Do not add one by inference.
- A conflicting legacy `member_only` flag and new `visibility` use the stricter restriction. `invite_only` remains unavailable for ticket purchase until a real invitation authority is designed.
- A revoked member cannot retrieve or mint a checkout session through the application. An already issued Stripe URL may remain open outside the application. The existing webhook settlement/refund rules remain unchanged pending association policy on whether to expire that session and how to handle payment that races revocation. This is a release gate for private ticketing, not a claim of closed provider exposure.

## T03 event authoring

- The current `events` repository and schema already own external registration, format, online URL, tags and visibility; the admin parser/form and error recovery now use those fields. No parallel event storage or migration was needed. The public projection already includes format/online URL; the detail component now renders them for published public events.
- The existing tag normalizer remains the catalog for admin input and public `?tag=` filtering. The new admin field accepts comma/newline-separated tags and the repository normalizes them. An invite-only ticket combination remains unsupported and is rejected on create/update, matching T02's fail-closed ticket policy.
- This code does not establish whether a particular online meeting link should be public. Staff publication controls the event and its already-public projection. Association guidance on event-link sharing should be recorded before using sensitive meeting URLs.
