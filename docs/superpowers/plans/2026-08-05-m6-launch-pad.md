# M6 Launch Pad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the bilingual Launch Pad program page, deterministic five-question funding picker, durable member cohort applications, staff-only cohort kanban with audited stage changes, and the public “Gone Global” graduate badge on Showcase listings.

**Architecture:** Keep all Neon/Drizzle access inside `lib/db/repos`. Add a dedicated M6 relational model for cohorts, applications, and landing partners, and extend the existing Showcase listing with a monotonic `goneGlobal` projection. Server components load public data and server actions enforce `Actor` authorization; the interactive funding wizard is URL/query driven so results are deterministic, shareable, and independently testable.

**Tech Stack:** Next.js App Router, React Server Components, TypeScript strict, Tailwind/shadcn primitives already in the repo, next-intl, Drizzle ORM with Neon Postgres, Zod, Vitest, and Playwright.

## Global Constraints

- Follow the v1.1 milestone order and keep this work isolated on `codex/m6-launch-pad`; do not modify Production/shared Vercel or Neon environments.
- Every repository method takes an `Actor`, validates input with Zod, and enforces the existing `member`/`staff`/`exco`/`superadmin` authorization model. Public reads may use an anonymous actor only through explicitly public methods.
- All visible copy belongs in `messages/en.json` and `messages/zh-HK.json`; do not add hardcoded English or Chinese UI strings in TSX.
- Use the existing deterministic `config/funding-schemes.ts` rule table and its official URLs; do not duplicate or change rule semantics.
- A graduate transition is terminal: setting an application to `graduated` sets the linked Showcase listing’s `goneGlobal` flag in the same transaction; later non-graduate moves are rejected and the flag is never cleared.
- M6 acceptance must prove: five funding fixture answer-sets, durable application, audited staff stage move, and a rendered Gone Global badge.
- Preserve prior migrations; add only sequential migration `drizzle/0015_m6_launch_pad.sql` plus its generated metadata snapshot and journal entry.

---

### Task 1: M6 schema, contracts, and migration

**Files:**
- Modify: `lib/db/schema-core.ts` (M6 enums/tables and `showcaseListings.goneGlobal`)
- Create: `lib/launchpad/contracts.ts`
- Create: `drizzle/0015_m6_launch_pad.sql`
- Create: `drizzle/meta/0015_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Create: `tests/unit/m6-schema-contract.test.ts`
- Create: `tests/unit/m6-contracts.test.ts`

**Interfaces:**
- Export `cohortStatusEnum`, `cohortApplicationStageEnum`, and `landingPartnerMouStatusEnum` with values `planning|open|active|completed|archived`, `applied|accepted|ready|match|land|scale|graduated|rejected`, and `prospect|in_discussion|signed|inactive` respectively.
- Export `cohorts`, `cohortApplications`, and `landingPartners`; `cohortApplications` has unique `(cohortId, companyId)`, `readiness` JSONB, and `notes` text. `showcaseListings` gains `goneGlobal` boolean default false not-null.
- `lib/launchpad/contracts.ts` exports `cohortApplicationInputSchema`, `cohortStageSchema`, `publicCohortSchema`, `publicLandingPartnerSchema`, `parseCohortStage`, and `parseCohortApplicationInput`.

- [ ] **Step 1: Write the failing schema and contract tests**

```ts
it("exposes the M6 enums, tables, and monotonic showcase flag", () => {
  expect(enumValues("cohortApplicationStageEnum")).toEqual([
    "applied", "accepted", "ready", "match", "land", "scale", "graduated", "rejected",
  ]);
  expect(tableConfig("cohorts")?.name).toBe("cohorts");
  expect(tableConfig("cohortApplications")?.name).toBe("cohort_applications");
  expect(tableConfig("landingPartners")?.name).toBe("landing_partners");
  expect(tableConfig("showcaseListings")?.columns.map((column) => column.name)).toContain("gone_global");
});

it("accepts bounded application input and rejects blank company context", () => {
  expect(() => parseCohortApplicationInput({cohortId: "not-a-uuid"})).toThrow();
  expect(parseCohortApplicationInput({cohortId: "00000000-0000-0000-0000-000000000001", readiness: {market: "UK"}}).readiness).toEqual({market: "UK"});
});
```

- [ ] **Step 2: Run the focused tests to verify RED**

Run: `npm.cmd test -- tests/unit/m6-schema-contract.test.ts tests/unit/m6-contracts.test.ts`

Expected: FAIL because the M6 exports, column, and contract functions do not exist.

- [ ] **Step 3: Add Drizzle definitions, Zod contracts, and generated migration metadata**

Add the enum/table definitions beside the existing Showcase definitions, use the existing `createdAt`/`updatedAt` helpers, add FK indexes, and generate `0015_m6_launch_pad` with drizzle-kit so the SQL and snapshot agree. Keep the application uniqueness constraint named `cohort_applications_cohort_company_unique` and the public cohort/partner indexes explicit.

- [ ] **Step 4: Run focused tests and migration shape checks**

Run: `npm.cmd test -- tests/unit/m6-schema-contract.test.ts tests/unit/m6-contracts.test.ts`

Expected: PASS with the exact enum arrays, table names, constraints, migration SQL, snapshot, and journal tag `0015_m6_launch_pad`.

- [ ] **Step 5: Commit the schema boundary**

```powershell
git add lib/db/schema-core.ts lib/launchpad/contracts.ts drizzle/0015_m6_launch_pad.sql drizzle/meta/0015_snapshot.json drizzle/meta/_journal.json tests/unit/m6-schema-contract.test.ts tests/unit/m6-contracts.test.ts
git commit -m "feat: add M6 launch pad schema and contracts"
```

### Task 2: Cohort repository and deterministic M6 seed

**Files:**
- Create: `lib/db/repos/cohorts.ts`
- Create: `scripts/seed-m6.ts`
- Modify: `package.json` (`db:seed:m6`)
- Create: `tests/unit/m6-repository.test.ts`
- Create: `tests/unit/m6-seed.test.ts`

**Interfaces:**
- `createCohortRepository(dependencies?)` returns `listPublicCohorts()`, `listPublicPartners()`, `getApplicationForCompany(actor, cohortId, companyId)`, `createApplication(actor, cohortId, input)`, `listForAdmin(actor)`, and `moveApplication(actor, applicationId, nextStage, notes?)`.
- `createApplication` resolves the actor’s active company membership; it is idempotent on `(cohortId, companyId)` and only accepts cohorts with status `open`.
- `moveApplication` requires `requireAdmin`, validates a stage transition, writes an `auditEvents` row with action `cohort_application.stage_changed`, and updates `showcaseListings.goneGlobal` in the same transaction when entering `graduated`.
- Seed creates one open cohort, three landing partners, and five applications covering all non-terminal kanban stages without logging PII.

- [ ] **Step 1: Write failing repository tests with a fake store**

Cover member-only application creation, idempotent repeat submission, staff-only list/move, rejected invalid transitions, one audit event per accepted move, and the graduated Showcase flag update.

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- tests/unit/m6-repository.test.ts`

Expected: FAIL because `createCohortRepository` and its store contract are absent.

- [ ] **Step 3: Implement repository/store boundary**

Use `getDb`, Drizzle transactions, `requireMember`, `requireAdmin`, and the existing `companyMembers`/`showcaseListings`/`auditEvents` tables. Insert the audit event before returning the updated application; rollback the transaction if either audit or projection update fails. Never expose `landingPartners.contact` or `notes` from public methods.

- [ ] **Step 4: Add seed script and package command**

Use `DATABASE_URL` through the existing database client, upsert by stable slugs/IDs, and make the script safe to run twice. Add `"db:seed:m6": "tsx scripts/seed-m6.ts"`.

- [ ] **Step 5: Run repository and seed tests**

Run: `npm.cmd test -- tests/unit/m6-repository.test.ts tests/unit/m6-seed.test.ts`

Expected: PASS; seed tests assert stable counts and no duplicate application pairs after two runs.

- [ ] **Step 6: Commit the repository boundary**

```powershell
git add lib/db/repos/cohorts.ts scripts/seed-m6.ts package.json tests/unit/m6-repository.test.ts tests/unit/m6-seed.test.ts
git commit -m "feat: add launch pad cohort repository and seed"
```

### Task 3: Public Launch Pad page and funding picker

**Files:**
- Create: `lib/launchpad/funding.ts`
- Create: `components/marketing/funding-wizard.tsx`
- Create: `components/marketing/cohort-calendar.tsx`
- Create: `components/marketing/landing-partner-map.tsx`
- Modify: `app/[locale]/(public)/launchpad/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh-HK.json`
- Create: `tests/unit/m6-funding.test.ts`
- Create: `tests/unit/m6-launchpad-page.test.tsx`

**Interfaces:**
- `lib/launchpad/funding.ts` exports `fundingQuestionKeys`, `parseFundingAnswers(searchParams)`, and `getFundingResults(searchParams, locale)`; it calls `evaluateFundingEligibility` and returns the existing five scheme records with localized labels and official links.
- `FundingWizard` receives `locale`, `answers`, and `labels`, renders five keyboard-navigable questions, and uses a GET form whose query keys are stable (`sector`, `stage`, `market`, `employees`, `revenue`).
- `CohortCalendar` receives public cohorts; `LandingPartnerMap` receives public partner projections only.

- [ ] **Step 1: Write five fixture tests and page contract tests**

Assert each fixture answer set returns the expected scheme code(s), missing/invalid query values produce no false positive, official URLs are preserved, both locales render required Launch Pad sections, and partner contact/notes never appear in rendered output.

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- tests/unit/m6-funding.test.ts tests/unit/m6-launchpad-page.test.tsx`

Expected: FAIL because the parser, components, and page data loading are absent.

- [ ] **Step 3: Implement server-side query parsing and UI**

Keep the wizard as a client component only for form UX; calculate results in the page from `searchParams` using the existing deterministic rules. Render program explainer, calendar, static partner map, five-question picker, results with official links, and the “book a clinic” CTA through next-intl keys.

- [ ] **Step 4: Run focused tests and string audit**

Run: `npm.cmd test -- tests/unit/m6-funding.test.ts tests/unit/m6-launchpad-page.test.tsx` and `npm.cmd run audit:strings`

Expected: PASS; all visible strings are sourced from messages.

- [ ] **Step 5: Commit the public page**

```powershell
git add lib/launchpad/funding.ts components/marketing/funding-wizard.tsx components/marketing/cohort-calendar.tsx components/marketing/landing-partner-map.tsx app/[locale]/(public)/launchpad/page.tsx messages/en.json messages/zh-HK.json tests/unit/m6-funding.test.ts tests/unit/m6-launchpad-page.test.tsx
git commit -m "feat: build launch pad public experience and funding picker"
```

### Task 4: Member application flow

**Files:**
- Create: `lib/launchpad/member-actions.ts`
- Create: `components/marketing/cohort-application-form.tsx`
- Modify: `app/[locale]/(public)/launchpad/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh-HK.json`
- Create: `tests/unit/m6-member-application.test.tsx`

**Interfaces:**
- `applyToCohort(actor, cohortId, input, repository = cohortRepository)` delegates to `createApplication` and returns the durable application.
- `applyToCohortAction(formData)` calls `requireActor`, validates `cohortId`, market, readiness, and consent, then revalidates the locale Launch Pad and portal paths.
- The form posts no company ID; the repository derives the actor’s active company membership to prevent cross-company writes.

- [ ] **Step 1: Write failing action/form tests**

Test authenticated member success, anonymous rejection, closed cohort rejection, repeat submission idempotency, and accessible bilingual field/error labels.

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- tests/unit/m6-member-application.test.tsx`

Expected: FAIL because the action and form do not exist.

- [ ] **Step 3: Implement action and form**

Use a server action with Zod parsing, no PII in logs, and a success state that preserves the current locale. Show only open cohorts and link the funding clinic CTA from the page.

- [ ] **Step 4: Run focused test and typecheck**

Run: `npm.cmd test -- tests/unit/m6-member-application.test.tsx` then `npm.cmd run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the member flow**

```powershell
git add lib/launchpad/member-actions.ts components/marketing/cohort-application-form.tsx app/[locale]/(public)/launchpad/page.tsx messages/en.json messages/zh-HK.json tests/unit/m6-member-application.test.tsx
git commit -m "feat: add member cohort application flow"
```

### Task 5: Staff cohort kanban

**Files:**
- Create: `lib/admin/cohort-actions.ts`
- Create: `components/admin/cohort-kanban.tsx`
- Create: `app/[locale]/(admin)/admin/cohorts/page.tsx`
- Modify: `components/admin/admin-nav.tsx`
- Modify: `app/[locale]/(admin)/admin/layout.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh-HK.json`
- Create: `tests/unit/m6-admin-cohorts.test.tsx`

**Interfaces:**
- `moveCohortApplicationAction(path, formData)` calls `requireAdminActor`, parses application ID/stage/notes, invokes `cohortRepository.moveApplication`, and revalidates `path`.
- `CohortKanban` receives grouped applications, stage labels, and a bound server action; it renders all eight stages and keyboard-accessible move controls.
- `/[locale]/admin/cohorts` is protected by the existing admin layout and reads only `cohortRepository.listForAdmin(actor)`.

- [ ] **Step 1: Write failing admin tests**

Assert non-admins are rejected, stage moves call the repository with the correct actor and target, invalid transitions return localized errors, and the page renders every stage column with no private partner contact data.

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- tests/unit/m6-admin-cohorts.test.tsx`

Expected: FAIL because the route, action, and kanban are absent.

- [ ] **Step 3: Implement staff route/action/UI**

Extend Admin navigation labels with `cohorts`, keep role gating in `requireAdminPageActor`, and use server actions for writes. Display company and cohort names but never raw application notes to public clients.

- [ ] **Step 4: Run focused test and lint**

Run: `npm.cmd test -- tests/unit/m6-admin-cohorts.test.tsx` and `npm.cmd run lint`

Expected: PASS.

- [ ] **Step 5: Commit the admin workflow**

```powershell
git add lib/admin/cohort-actions.ts components/admin/cohort-kanban.tsx app/[locale]/(admin)/admin/cohorts/page.tsx components/admin/admin-nav.tsx app/[locale]/(admin)/admin/layout.tsx messages/en.json messages/zh-HK.json tests/unit/m6-admin-cohorts.test.tsx
git commit -m "feat: add staff launch pad cohort kanban"
```

### Task 6: Gone Global Showcase projection

**Files:**
- Modify: `lib/db/repos/showcase.ts`
- Modify: `lib/showcase/contracts.ts`
- Modify: `components/marketing/showcase-card.tsx`
- Modify: `components/marketing/showcase-detail.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh-HK.json`
- Create: `tests/unit/m6-graduate-badge.test.tsx`

**Interfaces:**
- Public Showcase listing projections include `goneGlobal: boolean`; member/admin writes preserve it.
- `ShowcaseCard` and `ShowcaseDetail` render the localized “Gone Global” badge only when `goneGlobal === true`.

- [ ] **Step 1: Write failing badge tests**

Render a published listing with `goneGlobal: true` and one with false; assert only the first contains the localized badge in both locales, while existing premium/status rendering remains unchanged.

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- tests/unit/m6-graduate-badge.test.tsx`

Expected: FAIL because the projection and badge do not exist.

- [ ] **Step 3: Implement projection and badge**

Thread the existing Drizzle field through repository return types and both public components; keep badge copy in the message namespace and keep the admin/member editor unaware of the monotonic system field.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npm.cmd test -- tests/unit/m6-graduate-badge.test.tsx` then `npm.cmd run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the public projection**

```powershell
git add lib/db/repos/showcase.ts lib/showcase/contracts.ts components/marketing/showcase-card.tsx components/marketing/showcase-detail.tsx messages/en.json messages/zh-HK.json tests/unit/m6-graduate-badge.test.tsx
git commit -m "feat: show Gone Global graduate badges"
```

### Task 7: M6 acceptance fixtures, e2e coverage, and docs

**Files:**
- Create: `tests/e2e/m6-launch-pad.spec.ts`
- Create: `docs/m6-acceptance.md`
- Modify: `README.md`
- Modify: `AGENTS.md` (M6 changelog line and command if required)

- [ ] **Step 1: Add deterministic Playwright coverage**

Cover `/launchpad` in `en` and `/zh` with a seeded fixture or mocked repository, submit one application through the member flow, and verify the admin stage move plus public badge. Guard live Preview credentials with the existing skip convention; never print credentials.

- [ ] **Step 2: Document the acceptance demo**

Record seed command, five funding answer URLs, member application steps, admin kanban move, graduate transition, and the exact verification commands/results in `docs/m6-acceptance.md`; add a concise M6 section to `README.md`.

- [ ] **Step 3: Run M6 e2e and string audit**

Run: `npm.cmd run test:e2e -- tests/e2e/m6-launch-pad.spec.ts` and `npm.cmd run audit:strings`

Expected: deterministic tests PASS; live Preview test is skipped only when its explicit credentials are absent; string audit PASS.

- [ ] **Step 4: Commit acceptance artifacts**

```powershell
git add tests/e2e/m6-launch-pad.spec.ts docs/m6-acceptance.md README.md AGENTS.md
git commit -m "test: document M6 launch pad acceptance"
```

### Task 8: Full verification and handoff

**Files:**
- Modify only files needed to resolve M6-specific failures; preserve unrelated worktree artifacts.

- [ ] **Step 1: Run the complete verification suite**

Run, in order:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e -- tests/e2e/m6-launch-pad.spec.ts
npm.cmd run audit:strings
git diff --check
git status --short
```

Expected: all commands pass; any pre-existing baseline failure is recorded separately with its exact command and output, and M6 tests remain green.

- [ ] **Step 2: Verify migration and repository safety**

Confirm `0015_m6_launch_pad` is the newest journal entry, no direct Drizzle access was added outside `lib/db/repos`, no private partner contact/notes are in public projections, and the graduate flag cannot be cleared by a later stage move.

- [ ] **Step 3: Commit the final verification record**

```powershell
git add docs/m6-acceptance.md
git commit -m "test: verify M6 launch pad acceptance"
```

- [ ] **Step 4: Report the isolated branch state**

Report the final commit, test counts, build result, skipped live checks (if any), and the explicit next approval needed before any push/PR or Preview deployment.
