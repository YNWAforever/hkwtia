# M1 Membership, Billing, and Member Portal Design

**Status:** Approved in conversation on 2026-07-14; written-spec review pending

**Source of truth:** `WTIA_Codex_Build_Spec_v1.1.md`, milestone M1. The merged M0 Next.js application is the implementation baseline.

## Purpose

M1 turns the bilingual public membership page into a self-service member platform. A prospective member can choose a tier, authenticate with a magic link, provide their profile and company details, pay through Stripe when required, and reach an active member dashboard in less than five minutes. Existing company administrators can manage seats, and active members can maintain their profile, discover other opted-in members, view events and documents, and manage billing.

M1 does not build the staff CRM, approval console, marketing automation, AI Concierge, Showcase administration, Launch Pad operations, or AI-Ops dashboard. Those remain assigned to later milestones. The public M0 routes, locale behavior, metadata, and accessibility baseline remain intact.

## Chosen Approach

M1 is delivered as four testable vertical slices in one branch:

1. Membership foundation: schema, migrations, typed repositories, actor-based authorization, and audit records.
2. Join and identity: tier selection, Neon Auth magic links, profile/company capture, and non-paid membership paths.
3. Billing: Stripe Checkout, signed and idempotent webhooks, subscription lifecycle, Billing Portal, and receipts.
4. Member portal: dashboard, profile, company and seat management, directory, events, documents, and onboarding state.

The production integrations sit behind small server-only interfaces. Real adapters use Neon Auth, Neon Postgres, and Stripe test or live mode according to environment. Deterministic in-memory adapters are allowed only in automated tests; they are never selected silently in a deployed environment. This keeps business rules testable without weakening the requirement to verify the final flow against isolated Neon and Stripe test resources.

This approach was selected over two alternatives:

- Direct SDK calls from pages and actions were rejected because they would couple UI, authorization, persistence, and payment behavior and make webhook replay and failure tests brittle.
- A separate membership service was rejected because M1 does not need an additional deployment, network boundary, or operational surface. Focused modules inside the existing Next.js application provide sufficient isolation.

## Application Architecture

### Route groups and localization

The existing `app/[locale]` structure and `next-intl` proxy remain authoritative. English stays unprefixed and Traditional Chinese uses `/zh`.

- `app/[locale]/(public)/membership`: retains the M0 public comparison page and links each tier to a locale-aware join URL.
- `app/[locale]/(join)/join`: owns the authenticated join flow and its steps.
- `app/[locale]/(member)/portal`: owns the protected member experience.
- `app/api/auth/[...path]/route.ts`: delegates Neon Auth HTTP handling.
- `app/api/stripe/webhook/route.ts`: receives non-localized Stripe events and verifies their signatures before reading event data.

Join and portal layouts reuse the M0 locale shell but do not render the full public marketing navigation when it would distract from a transactional task. All member-visible copy remains in `messages/en.json` and `messages/zh-HK.json`.

### Server boundaries

- Pages are Server Components by default and load data through domain services.
- Mutations use Server Actions with Zod validation and return typed success or field-error results.
- Stripe Checkout, Billing Portal creation, webhook handling, session reads, and database access stay in server-only modules.
- Client Components are limited to interaction that needs browser state, such as form progress, invitation dialogs, and optimistic feedback.
- No database client, Stripe secret, internal identifier, or authorization decision is bundled into client code.

### Identity and session model

`lib/auth/server.ts` creates the Neon Auth server client with an explicit base URL and cookie secret, exposes the auth route handler, and returns the current session. Protected layouts are force-dynamic because their output depends on the session cookie.

The application converts a valid auth session into an `Actor` before calling domain code. The actor contains the authenticated user ID and the memberships, company roles, and system capability relevant to the request. Anonymous access is represented explicitly rather than with an optional user ID. Stripe webhook processing uses a narrowly scoped system actor named `stripe-webhook`; it does not bypass repository policy with raw SQL.

Every repository method accepts an `Actor` as its first argument. Repositories enforce record scope as well as query shape, so a page or action cannot accidentally read another company's private data by changing an identifier.

## Domain Model

Neon Auth owns its authentication tables. M1 adds application-owned tables through Drizzle migrations:

- `profiles`: one row per auth user, with display name, phone, job title, locale, onboarding state, and directory visibility. Email identity remains owned by Neon Auth.
- `companies`: legal/display name, website, industry, size band, description, logo reference, and directory visibility.
- `company_members`: user-to-company relationship with `owner`, `admin`, or `member` role and active/revoked timestamps.
- `seat_invitations`: normalized invited email, company, role, token digest, expiry, acceptance state, and inviter.
- `membership_plans`: stable plan code, audience, billing behavior, Stripe price reference, seat allowance, and active flag. Plan codes are `community`, `startup`, `corporate`, and `patron`; translated labels remain message content.
- `membership_applications`: join attempt, selected plan, applicant, company when applicable, current step, and `draft`, `pending_payment`, `pending_review`, `completed`, or `abandoned` status.
- `memberships`: member owner or company, plan, lifecycle status, seat limit, Stripe customer/subscription references when applicable, and billing period timestamps.
- `jobs`: external-event idempotency ledger with unique `run_key`, kind, state, attempt count, timestamps, and a safe error summary.
- `audit_events`: append-only actor, action, target type and ID, timestamp, request correlation ID, and redacted metadata.

Membership lifecycle values are `pending_payment`, `pending_review`, `active`, `past_due`, `cancel_at_period_end`, `cancelled`, and `expired`. Database constraints prevent a membership from targeting both an individual and a company, prevent duplicate active company membership rows, and prevent duplicate job run keys.

Stripe price IDs are configuration, not source data. The database stores stable WTIA plan codes and the Stripe object IDs that were actually used. Money is never represented as floating point.

## Join Flow

1. A visitor selects a tier on `/membership`. The locale-aware link opens `/join?plan=<plan-code>`.
2. The server validates the plan code and stores no privileged state in query parameters. If the visitor is not authenticated, Neon Auth sends a magic link and returns the user to the same join flow.
3. The authenticated applicant completes a personal profile. Company plans also require company details. Each step is validated on the server and saved as an application draft so refreshes and magic-link round trips are recoverable.
4. The server creates the membership according to plan behavior:
   - `community`: activates without Stripe and proceeds to onboarding.
   - `startup` and `corporate`: creates a `pending_payment` membership and a Stripe Checkout Session, then redirects to Stripe.
   - `patron`: creates a `pending_review` membership and shows a clear manual-review status; it does not create a Checkout Session.
5. Checkout success returns the user to a processing page. The browser return URL never activates membership. Only a verified webhook can change paid membership state.
6. Once active, the user reaches onboarding, confirms directory preferences, and enters the dashboard. A completed application cannot create another membership when the success URL is refreshed.

Checkout Session creation uses a stable idempotency key derived from the membership and billing attempt. Session metadata includes only opaque application, membership, and plan identifiers. It contains no email, phone number, or company description.

## Stripe Billing and Webhooks

The billing adapter supports Checkout Session creation, Billing Portal Session creation, invoice listing, and retrieval of the small set of subscription fields needed by the application.

The webhook route handles:

- `checkout.session.completed`;
- `invoice.paid`;
- `invoice.payment_failed`;
- `customer.subscription.updated`;
- `customer.subscription.deleted`.

Processing follows this sequence:

1. Read the raw body and verify `Stripe-Signature` with the configured endpoint secret.
2. Begin a database transaction and insert `jobs.run_key = event.id`.
3. If the unique key already exists in a completed or processing state, acknowledge the replay without applying domain changes again.
4. Validate object metadata and load the referenced membership through the webhook system actor.
5. Apply the idempotent lifecycle transition, append an audit event, mark the job complete, and commit.
6. On a transient failure, store a redacted error summary and return a retryable response. Invalid signatures or malformed ownership metadata are rejected and never mutate membership state.

`invoice.payment_failed` moves a membership to `past_due`. The member retains portal access during Stripe's configured retry window and sees a prominent recovery action. `invoice.paid` restores `active`. `customer.subscription.deleted` or an ended subscription changes the membership to `cancelled` and removes member-only data access while preserving billing and audit history.

The Billing page creates a short-lived Stripe Billing Portal Session on demand. Receipt links come from Stripe invoice data and are not copied into public storage. Portal and invoice requests verify that the Stripe customer belongs to the actor's membership.

## Member Portal

### Dashboard and onboarding

`/portal` shows membership status, plan, renewal state, onboarding progress, upcoming events, and the next useful action. Pending-review and past-due users receive purpose-built status views. Cancelled or expired users can access only the renewal/billing recovery surface, not the directory or company-private data.

Onboarding completion is derived from explicit profile, company, directory-preference, and seat-setup fields. It is not a manually editable percentage.

### Profile and company

Members can update their own profile and directory visibility. Company owners and admins can update company details. Private fields such as billing email, phone, and invitation email are never exposed in directory queries unless a future field adds separate, explicit consent.

### Seats

Company owners and admins can invite, revoke, and change roles for seats within the membership's `seat_limit`. Pending, unexpired invitations count against capacity.

Invitation creation and acceptance lock the membership capacity row inside a transaction before counting active members and pending invitations. Unique constraints make repeated invite submission and acceptance safe. An invitation can be accepted only by an authenticated Neon Auth identity whose normalized email matches the invitation. The last company owner cannot be removed or demoted.

### Directory, events, and documents

- The directory returns only active members and companies that opted in. Search operates on approved public fields and paginates on the server.
- The Events portal view reuses M0's typed event records for M1 and adds member-context calls to action. Event operations and registrations remain out of scope until their assigned milestone.
- Documents lists approved code-owned member resources plus the actor's Stripe receipts. If no WTIA resource has been supplied, it renders an honest empty state rather than placeholder downloads.

## Authorization Rules

- Anonymous actors can read only public plan information and begin authentication.
- A member can read and edit their own profile and read only memberships they belong to.
- A company member can read company-private data for their own company.
- Only company owners and admins can edit company data or manage seats.
- Only an owner can grant or revoke the owner role, and every company must retain at least one owner.
- Directory queries expose only explicitly opted-in fields of active memberships.
- Billing actions require an active or recoverable membership and a matching Stripe customer reference.
- The webhook system actor can mutate billing lifecycle fields only through webhook-specific repository methods.

Authorization failures return a generic localized message and are audited without logging secret or personal values.

## Failure and Recovery Handling

- Expired or reused magic links return to sign-in with the selected plan preserved through a validated server-side continuation.
- Duplicate form submissions return the existing application or invitation result.
- Abandoned Checkout Sessions leave the membership `pending_payment`; the applicant can start a new billing attempt without creating another membership.
- A successful Stripe return received before the webhook shows a processing state and polls a bounded status endpoint; it never guesses payment success.
- Stripe or database outages produce retryable, localized errors and preserve the last valid application step.
- Seat races fail atomically with a capacity error; they never over-allocate.
- Missing optional event or document content renders an honest empty state.
- Logs contain correlation IDs, internal record IDs, event types, and safe status values only. Secrets, magic-link tokens, raw webhook bodies, and personal form data are excluded.

## Configuration and Resource Isolation

M1 uses the existing Vercel project but does not change production resources until the implementation and preview acceptance checks pass.

Required server variables are documented with empty values in `.env.example`, including Neon database/auth settings, Stripe secret and webhook values, and stable plan-to-price mappings. Browser-visible variables use the `NEXT_PUBLIC_` prefix only when the browser genuinely requires them.

Development and CI use an isolated Neon branch and Stripe test mode. Production credentials supplied in conversation are treated as secrets, are never echoed into source, logs, plans, or commits, and are not rotated or replaced without a separate explicit instruction.

## Testing Strategy

### Unit tests

- Zod schemas reject invalid plan, profile, company, seat, and continuation inputs.
- Lifecycle tests cover every allowed membership transition and reject stale or impossible transitions.
- Join orchestration tests cover community activation, paid checkout, patron pending review, refresh/retry idempotency, and application resume.
- Authorization tests exercise each actor role and cross-company denial.
- Seat tests cover pending capacity, concurrent acceptance, email mismatch, duplicate acceptance, and last-owner protection.
- Stripe mapping tests cover all five event types and malformed or foreign metadata.

### Database integration tests

Migrations run against a disposable Postgres database or isolated Neon test branch. Tests use real transactions and constraints to prove application uniqueness, webhook replay safety, tenant scoping, and seat capacity under concurrency. Repository tests call public repository methods with actors rather than issuing assertions only against raw SQL.

### Route and browser tests

- Signed webhook fixtures prove that the first event changes state and exact replay creates no duplicate membership, audit transition, or entitlement.
- Playwright covers magic-link continuation through the test auth adapter, join-step resume, community activation, paid-processing UI, portal protection, profile/company edits, seats, directory privacy, billing recovery, and both locales.
- A preview acceptance run uses an isolated Neon branch and Stripe test mode for the real startup join, Checkout, webhook, and dashboard path.
- Stripe test clocks prove renewal and payment-failure transitions.
- Billing Portal creation and receipt ownership are checked with Stripe test objects.

All M0 unit, lint, typecheck, build, route, metadata, accessibility, and Lighthouse checks remain regression gates.

## Acceptance Evidence

M1 is complete only when all of the following are demonstrated:

- A new user selects Startup, authenticates by magic link, pays through Stripe test Checkout, and reaches an active dashboard in less than five minutes.
- Replaying the same Checkout or invoice event produces no duplicate membership, job, seat, entitlement, or audit transition.
- A Stripe test clock renewal keeps the membership active, and a simulated payment failure moves it to the documented recoverable state.
- Community joins without Stripe, while Patron ends in `pending_review` without an accidental charge.
- Company owners and admins can manage seats up to the limit; concurrent or repeated operations cannot exceed it.
- Unauthorized users cannot read or mutate another profile, company, membership, invitation, invoice, or directory-private field.
- Billing Portal and receipts open only for the matching membership.
- Portal routes render correctly in English and Traditional Chinese, and M0 public acceptance remains green.

The milestone report records commands, test counts, preview deployment ID, isolated resource identifiers without secrets, measured join duration, webhook replay evidence, test-clock evidence, known limitations, and the rollback candidate.

## Deployment and Rollback

The branch deploys first as a Vercel preview using isolated Neon and Stripe test resources. Production promotion requires every acceptance item above and explicit confirmation before any production database migration, Stripe product/price change, or secret mutation.

Database migrations are additive and forward-only in M1. The previous M0 READY deployment remains the application rollback candidate. If production activation fails after schema migration, traffic rolls back to M0 while the additive M1 tables remain dormant; no destructive down migration runs automatically.

## Completion Boundary

M1 ends with a verified, bilingual self-service join and member portal. It does not infer completion from a successful build or mocked test alone. Real preview evidence for Neon Auth, Stripe Checkout, signed webhooks, membership activation, test-clock lifecycle, seat authorization, and Billing Portal is required before production promotion.
