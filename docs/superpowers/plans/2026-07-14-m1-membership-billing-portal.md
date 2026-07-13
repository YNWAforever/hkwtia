# M1 Membership, Billing, and Member Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a bilingual, self-service WTIA membership flow from tier selection through Neon Auth, Stripe billing, onboarding, and an authorized member portal.

**Architecture:** Keep the existing Next.js 16 App Router and `next-intl` locale shell. Add server-only Drizzle/Neon/Auth/Stripe adapters behind domain services, with every repository accepting an `Actor`; pages and Server Actions consume typed services, while signed webhook processing is the only path that activates paid membership.

**Tech Stack:** Next.js 16.2, React 19, TypeScript strict, `next-intl` 4.13, Drizzle ORM/Kit, `@neondatabase/serverless`, `@neondatabase/auth`, Stripe Node SDK, Zod, Vitest, Playwright, and PostgreSQL.

## Global Constraints

- Keep the M0 public route, metadata, accessibility, translation-parity, and Lighthouse gates green.
- English is unprefixed; Traditional Chinese is `/zh`; every new user-visible string is present in both message bundles.
- Database, Neon Auth, Stripe, and authorization logic are server-only. No secret or PII enters client bundles, query metadata, logs, plans, or commits.
- Every repository method takes an `Actor` first; cross-company access is denied in the repository, not only in a page.
- Validate all external input with Zod; use integer minor-unit money values and UTC timestamps.
- Webhook event IDs are unique `jobs.run_key` values; event replay must be a no-op.
- Development, CI, and preview use an isolated Neon branch and Stripe test mode. Do not mutate production resources or rotate secrets in this plan.
- Use test-first development: each behavior gets a failing test, the failure is observed, then the smallest implementation is added.
- Use conventional commits and run focused tests after every task before committing.

## File Map

### New server and domain files

- `lib/config/env.ts`: typed runtime environment parser with server/public separation.
- `lib/auth/server.ts`, `lib/auth/actor.ts`, `app/api/auth/[...path]/route.ts`: Neon Auth server client, session-to-actor conversion, and auth handler.
- `lib/db/client.ts`, `lib/db/schema.ts`, `drizzle.config.ts`, `drizzle/0001_m1_membership.sql`: database connection, Drizzle tables/constraints, and migration configuration.
- `lib/db/repos/profiles.ts`, `companies.ts`, `memberships.ts`, `applications.ts`, `seats.ts`, `jobs.ts`, `audit-events.ts`: actor-scoped persistence boundary.
- `lib/membership/plans.ts`, `join-schema.ts`, `lifecycle.ts`, `join-service.ts`, `onboarding.ts`: plan catalog and membership rules.
- `lib/billing/stripe.ts`, `checkout-service.ts`, `webhook-service.ts`, `receipt-service.ts`: Stripe adapter and idempotent billing orchestration.
- `lib/portal/queries.ts`, `lib/portal/commands.ts`: dashboard/read-model and mutation services.
- `scripts/db-migrate.ts`, `scripts/db-seed.ts`, `tests/helpers/fakes.ts`: safe migration/seed entrypoints and deterministic test adapters.

### New route and component files

- `app/[locale]/(join)/join/page.tsx`, `join/profile/page.tsx`, `join/company/page.tsx`, `join/checkout/page.tsx`, `join/complete/page.tsx`.
- `app/[locale]/(member)/portal/layout.tsx`, `portal/page.tsx`, `profile/page.tsx`, `company/page.tsx`, `company/seats/page.tsx`, `directory/page.tsx`, `events/page.tsx`, `documents/page.tsx`, `billing/page.tsx`.
- `app/api/stripe/webhook/route.ts`, `app/api/membership/status/route.ts`.
- `components/join/*`, `components/portal/*`, `components/billing/*` for focused interactive islands.

### Modified files

- `package.json`, `package-lock.json`, `.env.example`, `AGENTS.md`, `messages/en.json`, `messages/zh-HK.json`.
- `app/[locale]/(public)/membership/page.tsx` and `components/marketing/tier-comparison.tsx` to turn static tier actions into locale-aware join links.
- `scripts/not-available.mjs` or its callers so `db:migrate` and `db:seed` invoke the M1 scripts.
- `tests/unit/*` and `tests/e2e/*` for focused and acceptance coverage.

---

### Task 1: Runtime configuration and database foundation

**Files:**
- Create: `lib/config/env.ts`, `lib/db/client.ts`, `drizzle.config.ts`, `scripts/db-migrate.ts`, `scripts/db-seed.ts`
- Modify: `package.json`, `.env.example`, `AGENTS.md`
- Test: `tests/unit/env-contract.test.ts`, `tests/unit/db-script-contract.test.ts`

**Interfaces:**
- Produces `serverEnv(): { databaseUrl: string; neonAuthBaseUrl: string; neonAuthCookieSecret: string; stripeSecretKey: string; stripeWebhookSecret: string; appUrl: string }` and `publicEnv(): { siteUrl: string }`.
- Produces `db` from `lib/db/client.ts` using `@neondatabase/serverless` and Drizzle; importing the client never logs credentials.

- [ ] **Step 1: Write the failing tests**

```ts
it('rejects a deployed runtime without server credentials', () => {
  expect(() => parseServerEnv({ NODE_ENV: 'production', DATABASE_URL: '' })).toThrow('DATABASE_URL');
});

it('does not use the retired unavailable database command', async () => {
  const result = await runDbCommand('db:migrate', { DATABASE_URL: 'postgres://test' });
  expect(result).toContain('drizzle-kit migrate');
});
```

- [ ] **Step 2: Run `npm test -- tests/unit/env-contract.test.ts tests/unit/db-script-contract.test.ts` and observe the expected missing-module failure.**
- [ ] **Step 3: Install dependencies and implement the minimal environment parser and scripts.** Run `npm install drizzle-orm @neondatabase/serverless @neondatabase/auth stripe` and `npm install -D drizzle-kit`; define `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_URL`, and `NEXT_PUBLIC_SITE_URL` in `.env.example` with empty values.
- [ ] **Step 4: Run the focused tests, `npm run lint`, and `npm run typecheck`; all pass with no credential values printed.**
- [ ] **Step 5: Commit** `chore: add M1 runtime and database foundation`.

### Task 2: Membership schema, constraints, and lifecycle rules

**Files:**
- Create: `lib/db/schema.ts`, `lib/membership/lifecycle.ts`, `drizzle/0001_m1_membership.sql`
- Test: `tests/unit/membership-lifecycle.test.ts`, `tests/unit/schema-contract.test.ts`

**Interfaces:**
- Produces `Actor`, `MembershipStatus`, `MembershipPlanCode`, `MembershipRecord`, and `canTransitionMembership(from, to): boolean`.
- Produces Drizzle tables `profiles`, `companies`, `companyMembers`, `seatInvitations`, `membershipPlans`, `membershipApplications`, `memberships`, `jobs`, and `auditEvents` with unique `jobs.runKey` and company/member constraints.

- [ ] **Step 1: Write the failing lifecycle and schema tests.**

```ts
it('allows paid membership to recover from past_due after invoice.paid', () => {
  expect(canTransitionMembership('past_due', 'active')).toBe(true);
});

it('rejects a direct pending_payment to cancelled transition', () => {
  expect(canTransitionMembership('pending_payment', 'cancelled')).toBe(false);
});

it('defines one unique idempotency key for webhook jobs', () => {
  expect(jobs.runKey).toBeDefined();
});
```

- [ ] **Step 2: Run `npm test -- tests/unit/membership-lifecycle.test.ts tests/unit/schema-contract.test.ts`; confirm it fails because the lifecycle module and tables do not exist.**
- [ ] **Step 3: Implement the status-transition map and Drizzle schema with `pgEnum`, foreign keys, check constraints, and unique indexes.** Generate `drizzle/0001_m1_membership.sql` with `npx drizzle-kit generate` and ensure all timestamps are `timestamptz`.
- [ ] **Step 4: Run focused tests and `npm run typecheck`; inspect the generated SQL for the unique `jobs.run_key`, membership target check, and company membership uniqueness.**
- [ ] **Step 5: Commit** `feat: add M1 membership schema and lifecycle rules`.

### Task 3: Actor authorization, Neon Auth, and repositories

**Files:**
- Create: `lib/auth/server.ts`, `lib/auth/actor.ts`, `app/api/auth/[...path]/route.ts`, `lib/db/repos/profiles.ts`, `companies.ts`, `memberships.ts`, `applications.ts`, `jobs.ts`, `audit-events.ts`
- Test: `tests/unit/actor-authorization.test.ts`, `tests/unit/repository-scope.test.ts`, `tests/helpers/fakes.ts`

**Interfaces:**
- Produces `getSession(): Promise<NeonSession | null>`, `getActor(): Promise<Actor | null>`, `requireActor(): Promise<Actor>`, and `systemActor(source: 'stripe-webhook'): Actor`.
- Each repository exposes actor-first methods such as `memberships.getById(actor, membershipId)`, `profiles.update(actor, userId, input)`, and `jobs.claim(actor, runKey, kind)`.

- [ ] **Step 1: Write failing tests for self access, cross-company denial, and the webhook system actor.**

```ts
it('denies a member from reading another company membership', async () => {
  await expect(repos.memberships.getById(actorFor('user-a'), membershipOwnedBy('company-b')))
    .rejects.toThrow('FORBIDDEN');
});

it('claims the same webhook run key only once', async () => {
  expect(await repos.jobs.claim(systemActor('stripe-webhook'), 'evt_123', 'checkout')).toBe('claimed');
  expect(await repos.jobs.claim(systemActor('stripe-webhook'), 'evt_123', 'checkout')).toBe('duplicate');
});
```

- [ ] **Step 2: Run the focused tests and observe failures caused by missing actor and repository implementations.**
- [ ] **Step 3: Implement Neon Auth server configuration with explicit base URL/cookie secret, convert sessions into an actor, and add the catch-all auth route.** Implement repository predicates so actor scope is included in every select/update/delete query; use the fake repository in unit tests.
- [ ] **Step 4: Run focused tests, `npm run lint`, and `npm run typecheck`; verify no repository imports `db` from a client module.**
- [ ] **Step 5: Commit** `feat: add actor authorization and repository boundaries`.

### Task 4: Plan catalog, validation, and join orchestration

**Files:**
- Create: `lib/membership/plans.ts`, `lib/membership/join-schema.ts`, `lib/membership/join-service.ts`, `lib/membership/onboarding.ts`
- Test: `tests/unit/join-service.test.ts`, `tests/unit/join-schema.test.ts`

**Interfaces:**
- Produces `PLAN_CODES = ['community', 'startup', 'corporate', 'patron'] as const`, `getPlan(code)`, and `JoinInput`.
- Produces `startJoin(actor, input): Promise<{ applicationId: string; next: 'profile' | 'company' | 'checkout' | 'complete' | 'review' }>`.

- [ ] **Step 1: Write failing tests for the four plan paths, invalid plan codes, and refresh-safe application reuse.**

```ts
it('activates community without starting Stripe checkout', async () => {
  const result = await startJoin(anonymousOrAuthenticatedActor(), { plan: 'community', applicationId: null });
  expect(result.next).toBe('profile');
  expect(fakeStripe.checkoutSessions).toHaveLength(0);
});

it('sends patron to review without creating a charge', async () => {
  const result = await completeApplication(actor, { plan: 'patron', profile, company });
  expect(result.next).toBe('review');
  expect(fakeStripe.checkoutSessions).toHaveLength(0);
});
```

- [ ] **Step 2: Run `npm test -- tests/unit/join-service.test.ts tests/unit/join-schema.test.ts`; observe missing plan/service failures.**
- [ ] **Step 3: Implement Zod schemas, plan metadata, application draft persistence, and the three non-Stripe/Stripe branch decisions.** Do not activate paid membership in this task; return a typed checkout command for the billing task.
- [ ] **Step 4: Run the focused tests and `npm run typecheck`; confirm application reuse on a repeated `applicationId`.**
- [ ] **Step 5: Commit** `feat: add membership join orchestration`.

### Task 5: Public tier links, authentication UI, and join pages

**Files:**
- Modify: `app/[locale]/(public)/membership/page.tsx`, `components/marketing/tier-comparison.tsx`, `messages/en.json`, `messages/zh-HK.json`
- Create: `app/[locale]/(join)/layout.tsx`, `join/page.tsx`, `join/profile/page.tsx`, `join/company/page.tsx`, `components/join/join-form.tsx`, `components/join/progress.tsx`
- Test: `tests/unit/membership-links.test.ts`, `tests/e2e/join-auth.spec.ts`

**Interfaces:**
- `TierComparison` renders each tier action as a locale-aware link to `/join?plan=<code>`.
- Join forms submit only to typed Server Actions and render field-level localized errors.

- [ ] **Step 1: Write a failing render test that asserts four tier links and a failing browser test for the join step labels in both locales.**
- [ ] **Step 2: Run the focused test; confirm the current static “coming soon” copy fails the link assertion.**
- [ ] **Step 3: Add locale-aware links, auth continuation, profile/company forms, progress state, and bilingual messages.** Keep forms server-rendered except the minimum client island for submission state.
- [ ] **Step 4: Run `npm test -- tests/unit/membership-links.test.ts`, `npm run audit:strings`, and the focused Playwright spec against the dev server; verify one visible `h1` and no console errors.**
- [ ] **Step 5: Commit** `feat: add bilingual membership join pages`.

### Task 6: Stripe checkout, Billing Portal, and receipt adapter

**Files:**
- Create: `lib/billing/stripe.ts`, `lib/billing/checkout-service.ts`, `lib/billing/receipt-service.ts`, `components/billing/checkout-status.tsx`
- Test: `tests/unit/checkout-service.test.ts`, `tests/unit/stripe-adapter.test.ts`, `tests/helpers/fakes.ts`

**Interfaces:**
- `createCheckoutSession(actor, membershipId): Promise<{ url: string }>` uses a stable idempotency key and opaque metadata.
- `createBillingPortalSession(actor, membershipId): Promise<{ url: string }>` verifies customer ownership.
- `listReceipts(actor, membershipId): Promise<Receipt[]>` maps only invoice ID, date, amount, status, and hosted invoice URL.

- [ ] **Step 1: Write failing tests for stable Checkout idempotency, metadata redaction, Billing Portal ownership, and receipt mapping.**
- [ ] **Step 2: Run the focused tests and observe missing adapter/service failures.**
- [ ] **Step 3: Implement a server-only Stripe adapter and fake adapter.** Use `stripe.checkout.sessions.create` with `idempotencyKey`, `client_reference_id`, opaque metadata, configured `success_url`, and `cancel_url`; never use user email in metadata.
- [ ] **Step 4: Run focused tests, `npm run lint`, and `npm run typecheck`; assert the fake captured no PII and a foreign actor gets `FORBIDDEN`.**
- [ ] **Step 5: Commit** `feat: add Stripe checkout and billing services`.

### Task 7: Signed, idempotent webhook lifecycle

**Files:**
- Create: `app/api/stripe/webhook/route.ts`, `lib/billing/webhook-service.ts`
- Modify: `lib/db/repos/jobs.ts`, `lib/db/repos/memberships.ts`
- Test: `tests/unit/webhook-service.test.ts`, `tests/unit/webhook-route.test.ts`, `tests/fixtures/stripe-events.ts`

**Interfaces:**
- `processStripeEvent(event: Stripe.Event, actor: Actor): Promise<'processed' | 'duplicate'>` handles the five M1 event types.
- The route reads the raw body, calls `stripe.webhooks.constructEvent`, and returns `200` only after a processed or duplicate result.

- [ ] **Step 1: Write failing tests for signature rejection, checkout activation, invoice recovery/failure, subscription deletion, and exact replay no-op.**

```ts
it('replaying checkout.session.completed does not add a second audit event', async () => {
  const event = checkoutCompleted('evt_123', membershipId);
  await processStripeEvent(event, systemActor('stripe-webhook'));
  await processStripeEvent(event, systemActor('stripe-webhook'));
  expect(await audit.countFor('evt_123')).toBe(1);
});
```

- [ ] **Step 2: Run the focused tests and observe failures before adding webhook code.**
- [ ] **Step 3: Implement raw-body signature verification, transactional `jobs` claim, metadata validation, lifecycle transition, audit append, and retryable error responses.** `invoice.payment_failed` maps to `past_due`, `invoice.paid` maps to `active`, and deletion maps to `cancelled`.
- [ ] **Step 4: Run focused tests and `npm run typecheck`; verify malformed metadata never mutates membership state.**
- [ ] **Step 5: Commit** `feat: add idempotent Stripe webhook processing`.

### Task 8: Protected portal shell, dashboard, profile, and company

**Files:**
- Create: `app/[locale]/(member)/portal/layout.tsx`, `portal/page.tsx`, `profile/page.tsx`, `company/page.tsx`, `components/portal/portal-nav.tsx`, `components/portal/status-card.tsx`, `lib/portal/queries.ts`, `lib/portal/commands.ts`
- Test: `tests/unit/portal-authorization.test.ts`, `tests/e2e/portal-dashboard.spec.ts`

**Interfaces:**
- Protected layout calls `requireActor()` and redirects anonymous users to locale-aware join/sign-in with a validated continuation.
- `getDashboard(actor): Promise<DashboardViewModel>` and `updateProfile(actor, input)` / `updateCompany(actor, input)` are the only page mutation dependencies.

- [ ] **Step 1: Write failing tests for anonymous redirect, member dashboard status, profile self-edit, and company admin authorization.**
- [ ] **Step 2: Run focused tests and observe missing portal route/service failures.**
- [ ] **Step 3: Implement force-dynamic protected layout, server read model, typed Server Actions, responsive portal navigation, onboarding state, and `active`/`past_due`/`pending_review` status cards in both locales.
- [ ] **Step 4: Run focused tests, `npm run audit:strings`, and Playwright; assert cancelled users cannot load private portal data.**
- [ ] **Step 5: Commit** `feat: add protected member portal foundation`.

### Task 9: Transactional company seat management

**Files:**
- Create: `lib/db/repos/seats.ts`, `app/[locale]/(member)/portal/company/seats/page.tsx`, `components/portal/seat-table.tsx`, `components/portal/seat-invite-form.tsx`
- Test: `tests/unit/seat-service.test.ts`, `tests/integration/seat-capacity.test.ts`, `tests/e2e/seat-management.spec.ts`

**Interfaces:**
- `inviteSeat(actor, companyId, input): Promise<SeatInvitation>`; `acceptSeatInvitation(actor, token): Promise<CompanyMember>`; `revokeSeat(actor, memberId): Promise<void>`; `changeSeatRole(actor, memberId, role): Promise<void>`.

- [ ] **Step 1: Write failing tests for seat-limit enforcement, pending invitations counting toward capacity, email mismatch, duplicate acceptance, and last-owner protection.**
- [ ] **Step 2: Run the focused unit test and observe the missing service failure.**
- [ ] **Step 3: Implement normalized-email invitation tokens, row-locked membership capacity transaction, unique company/user membership constraint, and owner/admin policy.
- [ ] **Step 4: Run unit and database integration tests; use two concurrent acceptance promises and assert one succeeds while the other returns a localized capacity error.**
- [ ] **Step 5: Run the focused Playwright flow in both locales and commit** `feat: add transactional company seat management`.

### Task 10: Directory, events, documents, billing, and recovery pages

**Files:**
- Create: `app/[locale]/(member)/portal/directory/page.tsx`, `events/page.tsx`, `documents/page.tsx`, `billing/page.tsx`, `components/portal/directory-results.tsx`, `components/portal/document-list.tsx`, `components/billing/billing-actions.tsx`
- Test: `tests/unit/portal-content-scope.test.ts`, `tests/e2e/portal-secondary-pages.spec.ts`

**Interfaces:**
- `searchDirectory(actor, query, cursor): Promise<DirectoryPage>` returns opted-in active records only.
- `getMemberEvents(actor): Promise<EventRecord[]>` reuses M0 event content without exposing private membership fields.
- `getDocuments(actor): Promise<DocumentItem[]>` combines approved code-owned documents and actor-owned receipts.

- [ ] **Step 1: Write failing tests for directory privacy, cursor pagination, empty documents, past-due recovery action, Billing Portal link, and localized event content.**
- [ ] **Step 2: Run the focused test and observe missing portal query/page failures.**
- [ ] **Step 3: Implement server-scoped queries and the four route pages; create Billing Portal links through Task 6 and render honest empty states when no approved resource exists.**
- [ ] **Step 4: Run focused tests, both locale E2E specs, `npm run lint`, and `npm run typecheck`.**
- [ ] **Step 5: Commit** `feat: add member directory events documents and billing pages`.

### Task 11: Migration, seed, and environment documentation

**Files:**
- Modify: `scripts/db-migrate.ts`, `scripts/db-seed.ts`, `package.json`, `.env.example`, `AGENTS.md`
- Create: `scripts/seed-m1.ts`, `tests/integration/migration.test.ts`

**Interfaces:**
- `npm run db:migrate` applies Drizzle migrations from `drizzle/` against `DATABASE_URL`.
- `npm run db:seed` inserts stable plan codes and no personal data; it is safe to run twice.

- [ ] **Step 1: Write a failing migration/seed test that runs the commands against `DATABASE_URL_TEST` and asserts four plan codes and zero duplicate rows after two seed runs.**
- [ ] **Step 2: Run the test and observe the existing “unavailable” command failure.**
- [ ] **Step 3: Wire the scripts, add seed upsert logic, document isolated Neon branch setup and Stripe test variables, and update the M1 changelog.**
- [ ] **Step 4: Run `npm run db:migrate`, `npm run db:seed` twice, and the integration test against the isolated test database; capture output without credentials.**
- [ ] **Step 5: Commit** `chore: enable M1 migrations and seed data`.

### Task 12: End-to-end acceptance and regression gates

**Files:**
- Modify: `tests/e2e/join-auth.spec.ts`, `tests/e2e/portal-dashboard.spec.ts`, `playwright.config.ts`, `README.md`
- Create: `tests/e2e/m1-acceptance.spec.ts`, `tests/fixtures/m1-auth.ts`, `docs/m1-acceptance.md`

**Interfaces:**
- The M1 fixture can create a test user, company, Stripe customer/subscription, and signed webhook fixture without production credentials.
- `docs/m1-acceptance.md` records commands, test counts, preview deployment ID, isolated resource IDs, join duration, replay evidence, test-clock evidence, and rollback candidate.

- [ ] **Step 1: Write the failing acceptance test for Startup join → magic link → Stripe test Checkout → webhook → active dashboard under five minutes, plus Community, Patron, replay, seat-limit, authz, Billing Portal, and both-locale checks.**
- [ ] **Step 2: Run `npm run test:e2e -- tests/e2e/m1-acceptance.spec.ts`; observe failures only where the environment fixture or route is not yet connected.**
- [ ] **Step 3: Connect the deterministic test adapter for CI and the real isolated Neon/Stripe test-mode fixture for preview.**
- [ ] **Step 4: Run all gates: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run audit:strings`, `npm run test:e2e`, and `npm run test:lighthouse`.**
- [ ] **Step 5: Deploy a Vercel preview, run the real acceptance flow and Stripe test-clock renewal/payment-failure checks, record evidence, and commit** `test: add M1 acceptance evidence`.

## Plan Self-Review

- Spec coverage: schema/actors/repositories are Tasks 1–3; join/auth is Tasks 4–5; billing and webhooks are Tasks 6–7; portal and seats are Tasks 8–10; migrations and acceptance evidence are Tasks 11–12.
- Placeholder scan: no task depends on an unspecified function, error policy, or “appropriate” implementation; every public interface is named above.
- Type consistency: `Actor`, `MembershipStatus`, `MembershipPlanCode`, repository actor-first methods, and Stripe service return types are introduced before their consumers.
- Regression coverage: every task retains M0 route, translation, accessibility, and build gates.

Plan complete and saved to `docs/superpowers/plans/2026-07-14-m1-membership-billing-portal.md`. Two execution options:

1. **Subagent-Driven (recommended):** dispatch a fresh worker per task with review checkpoints.
2. **Inline Execution:** execute the tasks in this session with checkpoints.

Which approach?
