# Showcase Lead Contact Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Every accepted showcase introduction creates exactly one linked prospect contact, while an idempotent replay creates neither a second lead nor an orphan contact.

**Architecture:** Keep the lead as the submission record and the contact as the staff pipeline record. `databaseStore.insertLead` inserts the lead first, then a `showcase_intro` contact, then links `leads.contact_id`, all in one transaction. The public action passes the existing `contactWriterActor("showcase_intro")` capability to the repository; the repository checks that capability before loading the database.

**Tech Stack:** Next.js App Router, TypeScript strict mode, Drizzle ORM, PostgreSQL, Vitest.

## Global Constraints

- Use the isolated `audit-fixes` worktree. Do not run migrations, seeds, or writes against production.
- Preserve the existing lead idempotency key and request-intro response contract.
- Contact marketing and WhatsApp consent stay false or absent; an introduction is not a marketing opt-in.
- Run a focused failing test before implementation, then focused tests, full `npm test`, `npm run audit:strings`, `npm run lint`, `npm run typecheck`, and `npm run build`.

---

### Task 1: Capability boundary and service wiring

**Files:**
- Modify: `lib/db/repos/contacts.ts`
- Modify: `lib/db/repos/showcase.ts`
- Modify: `lib/showcase/lead-actions.ts`
- Test: `tests/unit/m5-leads.test.ts`
- Test: `tests/unit/showcase-lead-actor.test.ts`

**Interfaces:**
- `requireContactWriterSource(actor: unknown, source: ContactWriterSource): asserts actor is ContactWriterActor` verifies the private symbol and source.
- `ShowcaseRepository.createLead(actor: ContactWriterActor, input: NewLead): Promise<Lead | null>` passes an authorized introduction to the store.

- [x] **Step 1: Write failing tests.** In `m5-leads.test.ts`, capture the first `repository.createLead` argument and require `contactWriterActor("showcase_intro")` to have been passed; in `showcase-lead-actor.test.ts`, require an anonymous actor and a forged `{kind:"contact-writer",source:"showcase_intro"}` to reject before `insertLead` runs.
- [x] **Step 2: Run `npm.cmd exec -- vitest run tests/unit/m5-leads.test.ts tests/unit/showcase-lead-actor.test.ts`.** The actor assertions must fail because `createLead` currently accepts only the lead input.
- [x] **Step 3: Add the capability check, then pass it from the service.**

```ts
export function requireContactWriterSource(actor: unknown, source: ContactWriterSource): asserts actor is ContactWriterActor {
  requireContactWriter(actor);
  if (actor.source !== source) throw new Error("FORBIDDEN");
}
// Showcase facade:
async createLead(actor, input) {
  requireContactWriterSource(actor, "showcase_intro");
  return store.insertLead(input);
}
// Lead service:
const lead = await dependencies.repository.createLead(contactWriterActor("showcase_intro"), leadInput);
```
- [x] **Step 4: Run the same focused tests and require green.**

### Task 2: Atomic prospect capture

**Files:**
- Modify: `lib/db/repos/showcase.ts`
- Test: `tests/integration/showcase-lead-contact-postgres.test.ts`

**Interfaces:**
- `databaseStore.insertLead(input)` returns the inserted lead with `contactId`, or `null` for a duplicate idempotency key.

- [x] **Step 1: Write a disposable PostgreSQL 16 test.** Create minimal `leads` and `contacts` tables, insert one lead twice with the same idempotency key, and assert one lead, one contact, `leads.contact_id = contacts.id`, `contacts.source = 'showcase_intro'`, and `contacts.whatsapp_opt_in = false`. Add an injected contact-insert failure and assert the lead insert rolls back.
- [x] **Step 2: Run `$env:RUN_POSTGRES_INTEGRATION = '1'; npm.cmd exec -- vitest run tests/integration/showcase-lead-contact-postgres.test.ts` in PowerShell.** The linked-contact assertions must fail against the current bare lead insert.
- [x] **Step 3: Replace the bare insert with one transaction.**

```ts
return database.transaction(async (transaction) => {
  const lead = (await transaction.insert(leads).values({...input, contactId: null})
    .onConflictDoNothing({target: leads.idempotencyKey}).returning())[0] ?? null;
  if (!lead) return null;
  const contact = (await transaction.insert(contacts).values({
    displayName: lead.contactName, email: lead.email, locale: lead.locale,
    source: "showcase_intro",
  }).returning({id: contacts.id}))[0];
  if (!contact) throw new Error("SHOWCASE_LEAD_CONTACT_CAPTURE_FAILED");
  const linked = (await transaction.update(leads)
    .set({contactId: contact.id, updatedAt: new Date()})
    .where(eq(leads.id, lead.id)).returning())[0];
  if (!linked) throw new Error("SHOWCASE_LEAD_CONTACT_LINK_FAILED");
  return linked;
});
```
- [x] **Step 4: Run the same PostgreSQL test and focused unit suite; require green.**

### Task 3: Release gate

**Files:**
- No further source changes.

- [x] **Step 1: Run `npm.cmd test -- --run`, `npm.cmd run audit:strings`, `npm.cmd run lint`, `npm.cmd run typecheck`, and `npm.cmd run build`.** Treat lint warnings and environment-gated skips separately from failures.
- [x] **Step 2: Run `git diff --check`, restore generated `next-env.d.ts`, stage only the named source and test files, and commit `fix: link showcase leads to contacts`.**

## Self-review

- Source coverage: a fresh lead and replay are both tested; actor forgery is refused; consent remains off; a failed contact insert rolls back the lead.
- Type consistency: service, repository facade, and store signatures use the same `ContactWriterActor` and `NewLead` types.
- This plan is limited to contact capture. Durable email retry is a separate failure path and needs its own plan and gate.
