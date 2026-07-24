# M2 Admin CRM Design

**Status:** Approved in conversation on 2026-07-19; written-spec review pending

**Source of truth:** `WTIA_Codex_Build_Spec_v1.1.md`, milestone M2. The completed M0 public site and M1 membership branch are the implementation baseline.

## Purpose

M2 gives WTIA staff, ExCo, and superadmins one authoritative operating console for member service, segmentation, event operations, approvals, and management reporting. Staff can find a member, understand their membership and engagement history, add notes, build reusable audiences, queue a campaign, manage attendance, and reconcile the core membership KPIs without exporting data into a separate system.

M2 also introduces the role and CRM data contracts required by M3 automation and M4 AI-Ops. It does not send campaigns, schedule journeys, generate AI outreach, run agents, or create an analytics warehouse.

## Chosen Approach

M2 is delivered as five vertical slices:

1. Staff identity, additive schema alignment, and the `/admin` authorization boundary.
2. Searchable member list and Member 360.
3. Saved segments, safe CSV export, and immutable campaign queues.
4. At-risk operations, database-backed event management, check-in, and approvals.
5. Reconciled reports, deterministic seed data, and milestone acceptance evidence.

Each slice owns its route, application service, actor-first repository contract, audit behavior, translations, and tests. This follows the M1 architecture while avoiding a UI-first fixture layer that could diverge from real Neon behavior.

Campaign delivery is intentionally deferred to M3. M2 creates an auditable campaign and frozen recipient snapshot with `queued` delivery state; it never calls Resend.

## Identity and Authorization

Neon Auth continues to establish session identity. Application authorization becomes a separate database-backed resolution step:

1. Read the Neon Auth user ID from the session.
2. Resolve the profile by `auth_user_id`.
3. Return an `Actor` with `member`, `staff`, `exco`, or `superadmin` kind and the internal profile ID.
4. Resolve company roles only in repositories that need company scope.

The existing M1 profile identity remains valid. An additive migration introduces `auth_user_id`, backfills it from the current profile identity, and adds a unique constraint. This avoids a destructive primary-key rewrite while restoring the canonical distinction between auth identity and application profile.

`profiles` also gains email, role, last-login timestamp, marketing consent, interests, and the bilingual fields needed by Member 360. Existing M1 profile fields remain supported.

`app/[locale]/(admin)/admin/layout.tsx` calls `requireAdminActor()` before any CRM query. Anonymous users and members receive `notFound()` for every admin page. The same restriction is repeated in every admin repository; navigation visibility is not an authorization control. Staff, ExCo, and superadmin actors have M2 CRM access. Role administration itself is outside M2.

## Data Model

M2 adds the following Drizzle tables and enums through sequential migrations:

- `engagement_events`: profile, optional company, event type, points, metadata, and occurrence time.
- `engagement_scores`: one current score and trend per profile with computation time.
- `member_notes`: append-only staff-authored notes with optional replacement linkage.
- `email_log`: member, template, subject, status, provider ID, and timestamp.
- `saved_segments`: owner, bilingual name, versioned typed filter JSON, and timestamps.
- `campaigns`: saved-segment reference, template, locale strategy, status, creator, and timestamps.
- `campaign_recipients`: campaign, profile, frozen email/locale/variables, delivery state, and unique campaign/profile constraint.
- `events` and `event_registrations`: bilingual event content, publication/capacity rules, RSVP state, and idempotent check-in.
- `approvals`: action type, JSON payload, pending/approved/rejected/expired status, requester, decision actor, and timestamps.

Membership plan rows gain annual and monthly HKD price metadata. Memberships gain a billing interval where required for deterministic MRR and ARR. These additions do not change the working M1 Checkout lifecycle.

All foreign keys and required query paths are indexed, including membership renewal dates, profile engagement history, event starts, campaign state, and segment ownership.

## Repository and Service Boundaries

M2 repositories live under `lib/db/repos` and accept an `Actor` as their first argument. They expose purpose-specific operations rather than generic table access:

- `admin-members`: search, paginate, and compose Member 360.
- `engagement`: append events, read timelines, and read current scores.
- `member-notes`: append and replace notes.
- `segments`: validate filters, preview members, save definitions, and stream export rows.
- `campaigns`: create an idempotent campaign and freeze recipient snapshots.
- `admin-events`: create/update events, list attendees, and check in a registration.
- `approvals`: list pending actions and decide an action once.
- `reports`: return typed KPI aggregates and reconciliation details.

Application services coordinate multi-repository transactions. Every mutation writes its audit record in the same transaction. Test adapters are injected explicitly in tests; a deployed environment never selects fixture data when Neon is missing.

## Admin Routes and User Experience

All visible copy is translated through `next-intl` for English and Traditional Chinese. Admin pages remain server components unless an interaction requires client state.

- `/admin`: operating summary and links to current queues.
- `/admin/members`: debounced search, server-side filters, bounded pagination, and membership status/tier columns.
- `/admin/members/[id]`: Member 360 with profile, company, membership and Stripe links, engagement timeline, events, email history, and staff notes.
- `/admin/segments`: typed filter builder, saved definitions, result count, preview, CSV export, and campaign queue action.
- `/admin/at-risk`: members below the score threshold with renewal due within 60 days, ordered by renewal date.
- `/admin/events-mgmt`: event CRUD, attendee list, QR lookup/check-in, and attendance status.
- `/admin/approvals`: pending payload review and one-time approve/reject decision.
- `/admin/reports`: MRR, ARR, renewal, first-year renewal, join funnel, attendance, and at-risk metrics with reconciliation details.

Tables provide accessible captions, keyboard navigation, visible focus, meaningful empty states, and mobile overflow behavior. Forms announce field errors and preserve safe input after validation failures.

## Member 360

Member 360 is composed on the server from one application service. It returns:

- Profile and contact fields.
- Company memberships and roles.
- Membership status, plan, renewal date, billing interval, and Stripe dashboard links derived from stored Stripe IDs.
- Engagement score, trend, and chronological event timeline.
- RSVP and attendance history.
- Email-log history.
- Append-only staff notes and their authors.

The response is a purpose-built DTO; pages do not receive raw Drizzle rows. Empty sections are explicit rather than omitted, so every seeded and real member can be rendered consistently.

## Segments, Export, and Campaign Queue

A Zod-discriminated filter schema supports tier, membership status, score range, renewal window, company sector, and last-login window. One query compiler powers preview, CSV export, and campaign audience selection, preventing count drift between workflows.

CSV exports are staff-only, paginated, UTF-8, and neutralize cells beginning with spreadsheet formula characters. The audit record stores the segment ID, filter version, row count, and requesting actor without copying the export contents into logs.

Creating a campaign validates the saved segment, creates the campaign, evaluates the audience once, and stores frozen recipient email, locale, and template variables in one transaction. A stable idempotency key prevents duplicate campaigns from repeated submissions. Later profile changes do not silently alter that campaign. M3 will claim queued recipients and write delivery results to `email_log`.

## At-Risk and Event Operations

The M2 at-risk rule selects active or past-due memberships with an engagement score below 20 and a renewal date within 60 days. Results are ordered by renewal date and expose the evidence behind the classification. M2 permits staff to add a note or queue a templated campaign; AI-drafted outreach remains M4 work.

Events become repository-backed across public, portal, and admin surfaces. Published events remain publicly readable; member-only events require an eligible member actor. Check-in updates the registration to attended and appends exactly one engagement event in the same transaction. Repeated scans return the existing result and cannot award points twice.

## Approvals

M2 supplies the generic approval console and decision state machine needed by later agent work. Approval creation is available only to trusted application services and seeded fixtures in M2. A decision uses row locking or a conditional update so only a pending approval can transition. The decision actor, time, payload summary, and audit event are retained. M2 does not execute AI tools or send approved email.

## Reports and Reconciliation

Reports read operational tables directly. Formulas are explicit and covered by fixtures:

- ARR: annualized active recurring membership value in HKD.
- MRR: ARR divided by 12, with monthly subscriptions annualized first.
- Renewal rate: renewed memberships divided by memberships due in the selected period.
- First-year renewal: the same calculation restricted to first renewal.
- Join funnel: started application, completed profile, reached Checkout/review, and activated membership counts.
- Attendance: attended registrations divided by non-cancelled registrations for completed events.
- At-risk count: the same predicate used by the operational queue.

Every metric includes its numerator, denominator, and reporting window. Times are calculated in `Asia/Hong_Kong`. The report page never substitutes seeded constants or client-side arithmetic for repository results.

## Errors, Security, and Privacy

Zod validates every action and route input. Services use typed errors for validation, authorization, conflict, not-found, and retryable infrastructure failures. Pages translate expected errors into localized messages. Unexpected failures expose a request ID and do not log email addresses, phone numbers, note bodies, or exported rows.

All admin reads and writes recheck the actor in the repository. Mutations and audit records are atomic. CSV formula injection is neutralized. Search and export operations are bounded. Server Actions and route handlers use the existing same-origin/CSRF-safe framework boundary. No M2 response exposes another member's data to a member or company-admin actor.

## Seed and Demo Contract

The M2 seed extends the existing non-PII M1 data to include staff, ExCo, and superadmin profiles; varied companies and memberships; engagement histories; email logs; staff notes; events and registrations; saved segments; queued campaigns; and pending approvals.

The engineered acceptance segment `corporate + score below 20 + renewal within 60 days` returns exactly three members. The at-risk queue returns those same three fixtures in renewal order. Report fixtures include hand-calculated expected values committed with the tests. Every M2 admin page is non-empty immediately after seeding.

## Verification

M2 completion requires all of the following evidence:

- Unit tests for role resolution, filter validation/query compilation, at-risk classification, report formulas, CSV safety, campaign idempotency, approval transitions, and event check-in.
- Authorization tests proving anonymous, member, and company-admin actors cannot access any CRM repository or admin page.
- Neon integration tests for migrations, seed invariants, Member 360 composition, transactional audit writes, exact segment output, and reconciled reports.
- Playwright flows for staff navigation, member search, Member 360, notes, segment preview/export, campaign queueing, event management/check-in, approval decisions, reports, and member-facing 404 behavior.
- Full M0/M1 regression suites, typecheck, lint, dependency audit, production build, accessibility checks, and a READY preview deployment.

The milestone report will distinguish deterministic local evidence from live isolated-Neon evidence. No production database will be used as a test fixture.

## Explicitly Deferred

- Resend campaign delivery and all scheduled journeys: M3.
- WhatsApp sends and automation touchpoints: M3.
- AI-generated outreach, Concierge, Retention Analyst, Board Reporter, and agent approval creation: M4.
- Showcase listing operations and leads: M5.
- Launch Pad cohort operations: M6.
- Native apps, forum, accounting integration, analytics warehouse, SSO/SAML, and non-Stripe payment integrations: outside v1.
