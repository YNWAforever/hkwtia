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
