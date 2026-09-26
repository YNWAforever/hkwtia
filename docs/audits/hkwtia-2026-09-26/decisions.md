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

## T04 checkout recovery

- Migration 0043 adds `event_checkout_recoveries` with one digest per order. The browser gets a 32-byte random token in an HttpOnly/SameSite=Lax cookie; the database stores only SHA-256, an order FK, expiry and invalidation. The cookie also carries event/attempt identifiers for fail-closed provisional retry, but these identifiers do not authorize a read. A member-owned order requires the current member actor in addition to the capability.
- Recovery is one active ticket checkout per browser. The 45-minute capability lifetime is an implementation default beyond the current provider-session minimum, not an association policy. If the provider outcome is uncertain, the cookie blocks a new key and the user sees an unavailable state; only a provider-confirmed expiry releases an attached attempt. A lost cookie cannot recover a guest purchase on another device.
- Issuance occurs after the existing order/session lifecycle returns. A provisional cookie is set first; if capability persistence fails, no redirect is returned and a reload cannot silently start a second payable session. An isolated database and Stripe test-mode run must verify the row/session race before staging acceptance.

## T05 membership checkout return

- The checkout route is a local read-only summary. `beginMembershipCheckoutAction` is the only new entry that calls the existing idempotent `createCheckoutSession`; its server-side pending-application check precedes that call. The Stripe cancel URL already targets the summary path, so no provider URL or attempt key changed.
- The displayed annual fee comes from the validated persisted public catalog. If the active attempt uses a different Stripe price ID, or a safe lookup fails, the summary defers the exact amount to the Stripe checkout page rather than showing a newly configured price for an old session. The existing amount and provider price mapping remain authoritative.
- `readMembershipCheckoutStatus` uses `getBillingAccess` (personal owner or unrevoked company owner/admin) and maps persisted statuses only. `past_due` is displayed as requiring attention, without changing the existing benefit eligibility policy; `cancel_at_period_end` remains active until its actual lifecycle transition. The success `session_id` query is ignored for status.
- The 3-second interval and 20-read ceiling are centralized UX defaults, not a webhook SLA. A timeout leaves the membership processing and offers a manual recheck and support. Company details remain editable through the existing application-scoped action, which does not switch the plan or mint another attempt.
- Browser/provider acceptance needs an isolated pending-payment membership owned by `M2_TEST_MEMBER`, `HKWTIA_TEST_PENDING_MEMBERSHIP_ID`, `DATABASE_URL_TEST`, the M2 Neon auth pair, Stripe test-mode values, and a non-Production `PLAYWRIGHT_BASE_URL`. Success, decline, 3DS, early/late/replayed/async webhook outcomes still need that environment. No production payment was attempted.

## T06 Member 360 and list

- `lib/admin/membership-summary.ts` is the shared display ordering interface. The existing SQL status order is unchanged: active, past_due, cancel_at_period_end, pending_review, pending_payment, cancelled, expired, then membership ID and company ID. It is presentation order only and does not define payment or benefit eligibility. `adminMembersRepository.search` projects selected membership and company IDs; `get360` sorts all currently associated memberships by the same rule. Candidate company labels now join through the selected membership's company ID, avoiding a false company on a personal membership.
- The existing `adminMembersRepository` remains the Member 360 read owner. The staff-guarded `readMemberPurchases` helper within that repository reads `event_orders.buyer_profile_id` and corresponding seats. It does not merge a guest order by email. The first 25 newest orders are a bounded interim display until T11 adds complete pagination; this is not a claim of complete purchase history for prolific buyers. Refund status/reason are read from existing order fields, with no refund action added.
- The list's previous-page trail is a bounded opaque array of validated cursors, and the detail page reconstructs a local list URL from `q`, `limit`, `cursor`, and `history`. An external return URL is ignored. Plan/status/date labels are bilingual, and dates use Asia/Hong_Kong. Note author names come from the staff profile join while the immutable author profile ID remains visible for audit.
- No schema or policy change is needed for T06. Live list/detail and buyer isolation still require an isolated migrated M2 database, staff sign-in and the read-only acceptance walks.
