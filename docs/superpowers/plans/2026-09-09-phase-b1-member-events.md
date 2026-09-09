# Phase B1 — Two-Sided Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Startup or Corporate member submit an event from the portal, have staff approve it, let anyone RSVP (members via the existing registration, guests via a new form), remind registrants a day before, and let visitors filter `/events` by format, month, organiser and tag — without breaking the admin-authored events that exist today.

**Architecture:** Additive schema (`event_status`, `event_visibility`, `event_format`, `registration_mode` enums; organiser/submission/review columns on `events`; new `event_guest_registrations`), generated with drizzle-kit plus one custom backfill migration. `events.published` and `events.member_only` stay and are written in lock-step with the new enums by the repository, so every existing reader keeps working until it is moved. Member writes go through `eventsRepository` with company-role checks; public guest writes use a capability actor like `contactWriterActor`; `"use server"` modules stay thin wrappers over `*-core.ts`.

**Tech Stack:** Next.js 16 App Router (webpack) · React 19 · TypeScript strict · Drizzle ORM on Neon · next-intl v4 (`en`, `zh-HK` at `/zh`) · Zod · Vitest (jsdom) · Playwright · Tailwind v3 · Resend · Woztell mock adapter.

**Programme context:** `docs/superpowers/specs/2026-09-08-wtia-two-sided-platform-programme.md` §5 (B-1 … B-5, B-6 events half, B-8). Phase A status: `docs/superpowers/plans/2026-09-08-phase-a-foundation-and-funnel.md` exit checklist. The directory half of §5 (`/members`, company profiles, B-7) is `2026-09-09-phase-b2-member-directory.md`; the two plans are independent and may run in either order.

**Working rules for every task**
- Run the focused test first and read its failure before writing code (AGENTS.md).
- Never hand-build a locale prefix; use `localizedPath` (`tests/unit/locale-href-boundary.test.ts` enforces it).
- Never export an actor-taking function from a `"use server"` module (`tests/unit/server-action-actor-boundary.test.ts` enforces it); every runtime export there must be an async function.
- Every admin page imports `requireAdminPageActor` from `@/lib/admin/page-auth` and calls it before reading `searchParams` (`tests/unit/admin-page-auth-source.test.ts`).
- `npm run audit:strings` must stay green: all visible JSX text comes from `messages/en.json` + `messages/zh-HK.json`, added to both in the same commit.
- Migrations: change `lib/db/schema-core.ts`, run `npx drizzle-kit generate --config=drizzle.config.ts --name <tag>`, commit the SQL + `drizzle/meta/*` untouched, extend `tests/unit/schema-contract.test.ts`. Data backfills use `npx drizzle-kit generate --config=drizzle.config.ts --custom --name <tag>` and are the only SQL files written by hand.
- Local gotchas (Phase A): `.env.local` has empty `DATABASE_URL*` and `NEXT_PUBLIC_SITE_URL`; run `npm run build` as `NEXT_PUBLIC_SITE_URL=https://hkwtia.vercel.app npm run build`; validate migrations against a disposable `pgvector/pgvector:pg16` container (`docker run -d --rm --name hkwtia-mig -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=hkwtia -p 55432:5432 pgvector/pgvector:pg16`, then `DATABASE_URL=postgres://postgres:pw@localhost:55432/hkwtia npm run db:migrate`).
- Commit after every task with a conventional message.

**Scope decisions fixed by this plan**
- S-1 Public reads switch to `status = 'published' AND visibility = 'public'`; `published`/`member_only` are written by the repository from `status`/`visibility` on every write (D-12). No reader is deleted in this phase.
- S-2 Reminders (B-5) enrol **member** registrations in a new `event_reminder` journey through the existing `journey_state` runner. Guests get a confirmation email at RSVP; their 24-hour reminder lands with the Phase C notifications dispatcher (C-8), because `journey_state` is keyed by profile. To be recorded in the spec's Phase C scope when C is planned.
- S-3 Member hero images reuse the admin upload pipeline through a member-scoped route (`/api/portal/media/upload`); the row records `registered_by_profile_id`, and a member may only attach media they uploaded.
- S-4 Entitlement per quarter counts `events` rows with `submitted_by_profile_id` in the member's company whose `submitted_at` falls in the current calendar quarter (Asia/Hong_Kong) and whose status is not `draft`/`rejected`. `Number.POSITIVE_INFINITY` means unlimited.

---

## File map

| Path | Task | Responsibility |
|---|---|---|
| `lib/db/schema-core.ts` (M) | 1 | event enums, new `events` columns, `event_guest_registrations` |
| `drizzle/0026_phase_b_events_two_sided.sql` (generated), `drizzle/0027_phase_b_events_backfill.sql` (custom) | 1 | DDL, then status/visibility backfill |
| `tests/unit/schema-contract.test.ts` (M) | 1 | column/index/enum pins |
| `lib/events/status.ts` (C) | 2 | pure `derivedEventFlags`, transition table, quarter helper |
| `lib/events/entitlement-core.ts` (C) | 2 | `assertCanSubmitEvent(plan, usedThisQuarter)` |
| `lib/db/repos/events.ts` (M) | 2 | public reads by status/visibility; `saveMemberEventDraft`, `submitMemberEvent`, `reviewEvent`, `listCompanyEvents`, `countCompanySubmissionsThisQuarter`, `getEventForMemberEdit`, `listEventsForReview`; booleans kept in sync |
| `lib/events/member-contract.ts` (C) | 3 | zod `memberEventInputSchema`, `memberEventInputFromFormData` |
| `lib/events/member-core.ts` (C), `lib/events/member-actions.ts` (C) | 3 | actor-taking core + `"use server"` wrappers |
| `components/portal/event-form.tsx` (C) | 3 | bilingual form incl. format/online URL/registration mode/hero |
| `app/[locale]/(member)/portal/events/new/page.tsx` (C), `app/[locale]/(member)/portal/events/[id]/edit/page.tsx` (C), `app/[locale]/(member)/portal/events/page.tsx` (M) | 3 | member publishing pages |
| `lib/db/repos/media.ts` (M), `app/api/portal/media/upload/route.ts` (C), `lib/portal/media-upload.ts` (C) | 4 | member-scoped hero upload |
| `config/wisetech-protected-route-inventory.ts` (M), `tests/unit/wisetech-protected-route-ownership.test.ts` (M) | 4, 5, 6, 7 | route inventory pins |
| `lib/admin/event-review-core.ts` (C), `lib/admin/event-review-actions.ts` (C), `components/admin/event-review-table.tsx` (C), `app/[locale]/(admin)/admin/events-mgmt/page.tsx` (M) | 5 | review queue |
| `lib/events/guest-registration-core.ts` (C), `lib/events/guest-registration-action.ts` (C), `lib/db/repos/event-guests.ts` (C), `components/marketing/guest-rsvp-form.tsx` (C), `app/[locale]/(public)/events/[slug]/page.tsx` (M), `app/api/events/guest/cancel/route.ts` (C) | 6 | guest RSVP + cancel |
| `lib/admin/event-attendees.ts` (C), `app/api/admin/events/[id]/attendees.csv/route.ts` (C), `components/admin/attendee-table.tsx` (M), `app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx` (M) | 7 | merged attendee list + CSV |
| `lib/automation/types.ts` (M), `config/journeys.ts` (M), `lib/email/catalog.ts` (M), `config/whatsapp-templates.ts` (M), `lib/events/reminder-enrollment.ts` (C), `lib/db/repos/events.ts` (M) | 8 | `event_reminder` journey |
| `lib/events/filters.ts` (C), `app/[locale]/(public)/events/page.tsx` (M), `components/marketing/event-filter-panel.tsx` (C), `lib/structured-data.ts` (M), `app/[locale]/(public)/events/[slug]/page.tsx` (M) | 9 | filters + organiser block + `Event.organizer` |
| `tests/e2e/phase-b1-member-events.spec.ts` (C) | 10 | acceptance |
| `messages/en.json`, `messages/zh-HK.json` (M) | 3, 5, 6, 7, 8, 9 | every new string, in parity |

---

### Task 1: Schema — event enums, organiser/review columns, guest registrations (D-12)

**Files:**
- Modify: `lib/db/schema-core.ts` (enums after `contactStageEnum`; `events` table at :620-639; new table after `contacts`, before `acceptanceSentinel`; types at the end)
- Generate: `drizzle/0026_phase_b_events_two_sided.sql`, `drizzle/meta/0026_snapshot.json`, `_journal.json`
- Create (custom): `drizzle/0027_phase_b_events_backfill.sql`
- Modify: `tests/unit/schema-contract.test.ts`

- [ ] **Step 1: Write the failing schema-contract test**

Add `eventGuestRegistrations, events` to the named import from `@/lib/db/server-schema` and append:

```ts
describe("phase B1 two-sided events contract", () => {
  it("adds organiser, submission and review columns to events", () => {
    expect(events.organiserCompanyId).toBeDefined();
    expect(events.submittedByProfileId).toBeDefined();
    expect(events.submittedAt).toBeDefined();
    expect(events.status).toBeDefined();
    expect(events.visibility).toBeDefined();
    expect(events.format).toBeDefined();
    expect(events.onlineUrl).toBeDefined();
    expect(events.registrationMode).toBeDefined();
    expect(events.externalRegistrationUrl).toBeDefined();
    expect(events.tags).toBeDefined();
    expect(events.publishedAt).toBeDefined();
    expect(events.reviewedAt).toBeDefined();
    expect(events.reviewedByProfileId).toBeDefined();
    expect(events.rejectionReason).toBeDefined();
    // The booleans stay until the last consumer moves (programme D-12).
    expect(events.published).toBeDefined();
    expect(events.memberOnly).toBeDefined();
    const config = getTableConfig(events);
    expect(config.indexes.map((index) => index.config.name)).toContain("events_status_visibility_starts_idx");
    expect(config.checks.map((check) => check.name)).toContain("events_online_url_check");
  });

  it("defines event_guest_registrations with one row per event and email", () => {
    const config = getTableConfig(eventGuestRegistrations);
    expect(config.name).toBe("event_guest_registrations");
    expect(config.indexes.map((index) => index.config.name)).toContain("event_guest_registrations_event_email_unique");
    expect(config.indexes.map((index) => index.config.name)).toContain("event_guest_registrations_idempotency_unique");
    expect(eventGuestRegistrations.contactId).toBeDefined();
    expect(eventGuestRegistrations.cancelTokenDigest).toBeDefined();
    expect(eventGuestRegistrations.marketingConsentAt).toBeDefined();
    expect(eventGuestRegistrations.checkedInAt).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/schema-contract.test.ts --reporter=dot`
Expected: FAIL — `eventGuestRegistrations` is not exported; `events.status` undefined.

- [ ] **Step 3: Add enums, columns and the table**

After `contactStageEnum` add:

```ts
export const eventStatusEnum = pgEnum("event_status", ["draft", "pending_review", "published", "rejected", "cancelled"]);
export const eventVisibilityEnum = pgEnum("event_visibility", ["public", "members_only", "invite_only"]);
export const eventFormatEnum = pgEnum("event_format", ["in_person", "online", "hybrid"]);
export const registrationModeEnum = pgEnum("registration_mode", ["rsvp", "external", "ticketed"]);
export const guestRegistrationStatusEnum = pgEnum("guest_registration_status", ["registered", "waitlist", "cancelled", "attended"]);
```

Replace the `events` table definition with (every existing column kept verbatim; new ones appended):

```ts
export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  titleEn: text("title_en").notNull(),
  titleZh: text("title_zh"),
  descriptionEn: text("description_en").notNull(),
  descriptionZh: text("description_zh"),
  startsAt: timestamp("starts_at", {withTimezone: true}).notNull(),
  endsAt: timestamp("ends_at", {withTimezone: true}),
  venue: text("venue"),
  capacity: integer("capacity"),
  memberOnly: boolean("member_only").default(false).notNull(),
  published: boolean("published").default(false).notNull(),
  heroMediaId: uuid("hero_media_id").references(() => media.id, {onDelete: "set null"}),
  createdAt: createdAt("created_at"),
  updatedAt: updatedAt("updated_at"),
  // Programme B-1 (D-12): the enums are the new truth; `published` and
  // `memberOnly` above are derived from them on every repository write and
  // stay until the last reader moves. Backfilled by 0027.
  organiserCompanyId: uuid("organiser_company_id").references(() => companies.id, {onDelete: "set null"}),
  submittedByProfileId: text("submitted_by_profile_id").references(() => profiles.id, {onDelete: "set null"}),
  submittedAt: timestamp("submitted_at", {withTimezone: true}),
  status: eventStatusEnum("status").default("draft").notNull(),
  visibility: eventVisibilityEnum("visibility").default("public").notNull(),
  format: eventFormatEnum("format").default("in_person").notNull(),
  onlineUrl: text("online_url"),
  registrationMode: registrationModeEnum("registration_mode").default("rsvp").notNull(),
  externalRegistrationUrl: text("external_registration_url"),
  tags: text("tags").array().default(sql`'{}'::text[]`).notNull(),
  publishedAt: timestamp("published_at", {withTimezone: true}),
  reviewedAt: timestamp("reviewed_at", {withTimezone: true}),
  reviewedByProfileId: text("reviewed_by_profile_id").references(() => profiles.id, {onDelete: "set null"}),
  rejectionReason: text("rejection_reason"),
}, (table) => [
  index("events_published_starts_idx").on(table.published, table.startsAt),
  index("events_hero_media_idx").on(table.heroMediaId),
  index("events_status_visibility_starts_idx").on(table.status, table.visibility, table.startsAt),
  index("events_organiser_idx").on(table.organiserCompanyId, table.submittedAt),
  check("events_online_url_check", sql`${table.format} = 'in_person' OR ${table.onlineUrl} IS NOT NULL`),
  check("events_external_registration_check", sql`${table.registrationMode} <> 'external' OR ${table.externalRegistrationUrl} IS NOT NULL`),
]);
```

After the `contacts` table (it must be declared before this one) add:

```ts
/**
 * Guest RSVPs (programme B-4). A guest is a contact, not a profile; the row
 * carries what the check-in desk needs, a cancel token digest for the
 * one-click cancel link, and an idempotency key so a double submit is one
 * row. One registration per event and email.
 */
export const eventGuestRegistrations = pgTable(
  "event_guest_registrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id").notNull().references(() => events.id, {onDelete: "cascade"}),
    contactId: uuid("contact_id").references(() => contacts.id, {onDelete: "set null"}),
    name: text("name").notNull(),
    email: text("email").notNull(),
    whatsappNumber: text("whatsapp_number"),
    organisation: text("organisation"),
    locale: varchar("locale", {length: 10}).default("en").notNull(),
    status: guestRegistrationStatusEnum("status").default("registered").notNull(),
    marketingConsentAt: timestamp("marketing_consent_at", {withTimezone: true}),
    cancelTokenDigest: text("cancel_token_digest").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    checkedInAt: timestamp("checked_in_at", {withTimezone: true}),
    cancelledAt: timestamp("cancelled_at", {withTimezone: true}),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    uniqueIndex("event_guest_registrations_event_email_unique").on(table.eventId, table.email),
    uniqueIndex("event_guest_registrations_idempotency_unique").on(table.idempotencyKey),
    index("event_guest_registrations_event_status_idx").on(table.eventId, table.status),
  ],
);
```

At the end of the file add:

```ts
export type EventGuestRegistration = typeof eventGuestRegistrations.$inferSelect;
export type NewEventGuestRegistration = typeof eventGuestRegistrations.$inferInsert;
export type EventStatus = (typeof eventStatusEnum.enumValues)[number];
export type EventVisibility = (typeof eventVisibilityEnum.enumValues)[number];
export type EventFormat = (typeof eventFormatEnum.enumValues)[number];
export type RegistrationMode = (typeof registrationModeEnum.enumValues)[number];
```

- [ ] **Step 4: Generate the DDL migration**

Run: `npx drizzle-kit generate --config=drizzle.config.ts --name phase_b_events_two_sided`
Expected: `drizzle/0026_phase_b_events_two_sided.sql` with five `CREATE TYPE`, `CREATE TABLE "event_guest_registrations"`, fourteen `ALTER TABLE "events" ADD COLUMN`, the two checks and two indexes; `_journal.json` idx 26.

- [ ] **Step 5: Write the custom backfill migration**

Run: `npx drizzle-kit generate --config=drizzle.config.ts --custom --name phase_b_events_backfill`
Expected: empty `drizzle/0027_phase_b_events_backfill.sql` and journal idx 27. Fill it with exactly:

```sql
-- Programme B-1 / D-12: derive the new enums from the booleans once. From
-- here on the repository writes both; readers move to the enums over Phase B.
UPDATE "events"
SET "status" = CASE WHEN "published" THEN 'published'::"event_status" ELSE 'draft'::"event_status" END,
    "visibility" = CASE WHEN "member_only" THEN 'members_only'::"event_visibility" ELSE 'public'::"event_visibility" END,
    "published_at" = CASE WHEN "published" THEN COALESCE("published_at", "created_at") ELSE NULL END;
```

- [ ] **Step 6: Run the schema tests and the migration chain**

Run: `npx vitest run tests/unit/schema-contract.test.ts --reporter=dot && npm run typecheck`
Expected: PASS.

Run (disposable container per the working rules): `DATABASE_URL=postgres://postgres:pw@localhost:55432/hkwtia npm run db:migrate && docker exec hkwtia-mig psql -U postgres -d hkwtia -Atc "select count(*) from drizzle.__drizzle_migrations; select column_name from information_schema.columns where table_name='events' and column_name in ('status','visibility','format')"`
Expected: 27 rows; the three columns listed.

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema-core.ts drizzle/0026_phase_b_events_two_sided.sql drizzle/0027_phase_b_events_backfill.sql drizzle/meta tests/unit/schema-contract.test.ts
git commit -m "feat(db): event status/visibility/format enums, organiser and review columns, guest registrations (B-1, D-12)"
```

---

### Task 2: Events repository v2 — status-driven reads, member drafts, submission, review, entitlement (B-1)

**Files:**
- Create: `lib/events/status.ts`, `lib/events/entitlement-core.ts`
- Modify: `lib/db/repos/events.ts` (schemas :14-41, `listPublicEvents` :139-157, `countPublicEvents` :165, `getPublicEventBySlug` :178, `listMemberEvents` :212, `getEventBySlug` :315-323, `createEvent` :249, `updateEvent` :263, facade :340-352)
- Test: `tests/unit/event-status.test.ts`, `tests/unit/event-entitlement.test.ts`, `tests/unit/member-event-repository.test.ts`, extend `tests/unit/public-event-repository.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/event-status.test.ts
import {describe, expect, it} from "vitest";

import {canTransitionEvent, derivedEventFlags, hongKongQuarterBounds} from "@/lib/events/status";

describe("event status helpers (programme B-1, D-12)", () => {
  it("derives the legacy booleans from the enums", () => {
    expect(derivedEventFlags({status: "published", visibility: "public"})).toEqual({published: true, memberOnly: false});
    expect(derivedEventFlags({status: "published", visibility: "members_only"})).toEqual({published: true, memberOnly: true});
    expect(derivedEventFlags({status: "pending_review", visibility: "public"})).toEqual({published: false, memberOnly: false});
    expect(derivedEventFlags({status: "published", visibility: "invite_only"})).toEqual({published: true, memberOnly: true});
  });

  it("allows only the review-loop transitions", () => {
    expect(canTransitionEvent("draft", "pending_review")).toBe(true);
    expect(canTransitionEvent("pending_review", "published")).toBe(true);
    expect(canTransitionEvent("pending_review", "rejected")).toBe(true);
    expect(canTransitionEvent("rejected", "pending_review")).toBe(true);
    expect(canTransitionEvent("published", "cancelled")).toBe(true);
    expect(canTransitionEvent("draft", "published")).toBe(false);
    expect(canTransitionEvent("cancelled", "published")).toBe(false);
  });

  it("computes calendar-quarter bounds in Hong Kong time", () => {
    const bounds = hongKongQuarterBounds(new Date("2026-09-09T20:00:00.000Z"));
    expect(bounds.start.toISOString()).toBe("2026-06-30T16:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-09-30T16:00:00.000Z");
  });
});
```

```ts
// tests/unit/event-entitlement.test.ts
import {describe, expect, it} from "vitest";

import {assertCanSubmitEvent, EventEntitlementError} from "@/lib/events/entitlement-core";

describe("assertCanSubmitEvent (programme D-5)", () => {
  it("blocks community, caps startup at 2 per quarter, never caps corporate", () => {
    expect(() => assertCanSubmitEvent("community", 0)).toThrow(EventEntitlementError);
    expect(() => assertCanSubmitEvent("startup", 1)).not.toThrow();
    expect(() => assertCanSubmitEvent("startup", 2)).toThrow("EVENT_QUOTA_EXCEEDED");
    expect(() => assertCanSubmitEvent("corporate", 500)).not.toThrow();
    expect(() => assertCanSubmitEvent("patron", 500)).not.toThrow();
  });

  it("reports the code that blocked", () => {
    try {
      assertCanSubmitEvent("community", 0);
      throw new Error("expected EventEntitlementError");
    } catch (error) {
      expect(error).toBeInstanceOf(EventEntitlementError);
      expect((error as EventEntitlementError).code).toBe("EVENT_PUBLISHING_NOT_INCLUDED");
    }
  });
});
```

```ts
// tests/unit/member-event-repository.test.ts
import {describe, expect, it, vi} from "vitest";

import {
  countCompanySubmissionsThisQuarter, getEventForMemberEdit, listCompanyEvents, reviewEvent,
  saveMemberEventDraft, submitMemberEvent,
} from "@/lib/db/repos/events";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const EVENT = "22222222-2222-4222-8222-222222222222";
const member = {kind: "member" as const, userId: "u", profileId: "member-1"};
const outsider = {kind: "member" as const, userId: "u2", profileId: "member-2"};
const staff = {kind: "staff" as const, userId: "s", profileId: "staff-1"};
const roles = async (actor: {profileId?: string}) => (actor.profileId === "member-1" ? "admin" as const : null);

const input = {
  slug: "ai-clinic-2026", titleEn: "AI Clinic", titleZh: null, descriptionEn: "Hands-on session", descriptionZh: null,
  startsAt: new Date("2030-03-01T02:00:00Z"), endsAt: new Date("2030-03-01T04:00:00Z"), venue: "KOHO", capacity: 40,
  format: "in_person" as const, onlineUrl: null, visibility: "public" as const, registrationMode: "rsvp" as const,
  externalRegistrationUrl: null, tags: ["ai"], heroMediaId: null,
};

function fakeDeps(rows: Record<string, unknown>[][] = [[]]) {
  const queue = [...rows];
  const execute = vi.fn(async () => queue.shift() ?? []);
  const database = {execute, transaction: async <T,>(work: (tx: {execute: typeof execute}) => Promise<T>) => work({execute})};
  return {execute, deps: {loadDatabase: async () => database as never, getCompanyRole: roles}};
}

describe("member event writes (programme B-1)", () => {
  it("refuses a member without a manager role on the organiser company before any SQL", async () => {
    const {execute, deps} = fakeDeps();
    await expect(saveMemberEventDraft(outsider, COMPANY, input, deps)).rejects.toThrow("FORBIDDEN");
    expect(execute).not.toHaveBeenCalled();
  });

  it("saves a draft and returns the row", async () => {
    const {execute, deps} = fakeDeps([[{id: EVENT, slug: "ai-clinic-2026", status: "draft", published: false, member_only: false}]]);
    await expect(saveMemberEventDraft(member, COMPANY, input, deps)).resolves.toMatchObject({id: EVENT, status: "draft"});
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("submits for review only inside the quota", async () => {
    const {deps} = fakeDeps([[{id: EVENT, status: "pending_review", published: false, member_only: false}]]);
    await expect(submitMemberEvent(member, COMPANY, input, {...deps, plan: "startup", usedThisQuarter: 1})).resolves.toMatchObject({status: "pending_review"});
    await expect(submitMemberEvent(member, COMPANY, input, {...deps, plan: "startup", usedThisQuarter: 2})).rejects.toThrow("EVENT_QUOTA_EXCEEDED");
    await expect(submitMemberEvent(member, COMPANY, input, {...deps, plan: "community", usedThisQuarter: 0})).rejects.toThrow("EVENT_PUBLISHING_NOT_INCLUDED");
  });

  it("reports a slug collision instead of silently updating another organiser's event", async () => {
    const {deps} = fakeDeps([[]]);
    await expect(saveMemberEventDraft(member, COMPANY, input, deps)).rejects.toThrow("EVENT_SLUG_TAKEN");
  });

  it("reviews only from pending_review and audits in the same transaction", async () => {
    const pending = {id: EVENT, slug: "ai-clinic-2026", status: "pending_review", visibility: "public", organiser_company_id: COMPANY};
    const {execute, deps} = fakeDeps([[pending], [{...pending, status: "published", published: true}], []]);
    await expect(reviewEvent(staff, EVENT, {decision: "approve"}, deps)).resolves.toMatchObject({status: "published"});
    expect(execute).toHaveBeenCalledTimes(3);
    const rejected = fakeDeps([[{...pending, status: "draft"}]]);
    await expect(reviewEvent(staff, EVENT, {decision: "reject", reason: "duplicate"}, rejected.deps)).rejects.toThrow("INVALID_EVENT_TRANSITION");
    await expect(reviewEvent(member, EVENT, {decision: "approve"}, deps)).rejects.toThrow();
  });

  it("scopes company listings and edits to managers and counts the quarter", async () => {
    const {execute, deps} = fakeDeps([[{count: 2}]]);
    await expect(listCompanyEvents(outsider, COMPANY, deps)).rejects.toThrow("FORBIDDEN");
    await expect(countCompanySubmissionsThisQuarter(member, COMPANY, {...deps, now: () => new Date("2026-09-09T00:00:00Z")})).resolves.toBe(2);
    expect(execute).toHaveBeenCalledTimes(1);
    const edit = fakeDeps([[{id: EVENT, organiser_company_id: COMPANY, status: "draft"}]]);
    await expect(getEventForMemberEdit(outsider, EVENT, edit.deps)).rejects.toThrow("FORBIDDEN");
  });
});
```

Append to `tests/unit/public-event-repository.test.ts` (extend that file's in-memory row factory with `status: "published"`, `visibility: "public"`, `format: "in_person"`, `registrationMode: "rsvp"`, `tags: []`, `organiserCompanyId: null` defaults, keeping its existing helper names — the test below uses `sourceFrom`/`eventRow` as placeholders for whatever those helpers are called):

```ts
  it("reads public events by status and visibility, not the legacy booleans", async () => {
    const slugs = (await listPublicEvents(anonymous, {status: "open", asOf, locale: "en"}, sourceFrom([
      eventRow({slug: "enum-published", published: false, memberOnly: false, status: "published", visibility: "public"}),
      eventRow({slug: "bool-only", published: true, memberOnly: false, status: "draft", visibility: "public"}),
      eventRow({slug: "members", published: true, memberOnly: false, status: "published", visibility: "members_only"}),
    ]))).map((event) => event.slug);
    expect(slugs).toEqual(["enum-published"]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/event-status.test.ts tests/unit/event-entitlement.test.ts tests/unit/member-event-repository.test.ts tests/unit/public-event-repository.test.ts --reporter=dot`
Expected: FAIL — modules not found; the public read still filters on `published`.

- [ ] **Step 3: Write the pure helpers**

```ts
// lib/events/status.ts
import type {EventStatus, EventVisibility} from "@/lib/db/schema-core";

/** D-12: the booleans every existing reader uses, derived from the enums on each write. */
export function derivedEventFlags(input: Readonly<{status: EventStatus; visibility: EventVisibility}>): Readonly<{published: boolean; memberOnly: boolean}> {
  return {published: input.status === "published", memberOnly: input.visibility !== "public"};
}

const transitions: Readonly<Record<EventStatus, readonly EventStatus[]>> = {
  draft: ["draft", "pending_review"],
  pending_review: ["pending_review", "published", "rejected", "draft"],
  published: ["published", "cancelled", "pending_review"],
  rejected: ["rejected", "pending_review", "draft"],
  cancelled: ["cancelled"],
};

export function canTransitionEvent(from: EventStatus, to: EventStatus): boolean {
  return transitions[from].includes(to);
}

const HONG_KONG_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Calendar quarter containing `at`, in Asia/Hong_Kong (fixed UTC+8, no DST). */
export function hongKongQuarterBounds(at: Date): Readonly<{start: Date; end: Date}> {
  const local = new Date(at.getTime() + HONG_KONG_OFFSET_MS);
  const year = local.getUTCFullYear();
  const quarterStartMonth = Math.floor(local.getUTCMonth() / 3) * 3;
  return {
    start: new Date(Date.UTC(year, quarterStartMonth, 1) - HONG_KONG_OFFSET_MS),
    end: new Date(Date.UTC(year, quarterStartMonth + 3, 1) - HONG_KONG_OFFSET_MS),
  };
}
```

```ts
// lib/events/entitlement-core.ts
import type {MembershipPlanCode} from "@/lib/membership/constants";
import {entitlementsFor} from "@/lib/membership/entitlements";

export type EventEntitlementCode = "EVENT_PUBLISHING_NOT_INCLUDED" | "EVENT_QUOTA_EXCEEDED";

export class EventEntitlementError extends Error {
  constructor(readonly code: EventEntitlementCode, readonly plan: MembershipPlanCode, readonly limit: number) {
    super(code);
    this.name = "EventEntitlementError";
  }
}

/**
 * Programme D-5: Community cannot submit; Startup gets 2 reviewed events per
 * calendar quarter; Corporate and Patron are unlimited (Infinity).
 */
export function assertCanSubmitEvent(plan: MembershipPlanCode, usedThisQuarter: number): void {
  const limit = entitlementsFor(plan).publishEventsPerQuarter;
  if (limit <= 0) throw new EventEntitlementError("EVENT_PUBLISHING_NOT_INCLUDED", plan, limit);
  if (usedThisQuarter >= limit) throw new EventEntitlementError("EVENT_QUOTA_EXCEEDED", plan, limit);
}
```

- [ ] **Step 4: Move public reads to the enums and keep the booleans in sync**

In `lib/db/repos/events.ts`, add to the imports (skip any already present):

```ts
import {inArray, sql} from "drizzle-orm";
import {requireAdmin} from "@/lib/auth/authorize";
import {getDb} from "@/lib/db/repos/common";
import type {AutomationDatabase, AutomationDatabaseLoader} from "@/lib/db/repos/journeys";
import {portalContentRepository} from "@/lib/db/repos/portal-content";
import {auditEvents, type EventStatus, type EventVisibility} from "@/lib/db/server-schema";
import {assertCanSubmitEvent} from "@/lib/events/entitlement-core";
import {canTransitionEvent, derivedEventFlags, hongKongQuarterBounds} from "@/lib/events/status";
import type {MembershipPlanCode} from "@/lib/membership/constants";
import type {CompanyRole} from "@/lib/membership/lifecycle";
```

Replace every `and(eq(events.published, true), eq(events.memberOnly, false), …)` in `listPublicEvents`, `countPublicEvents` and `getPublicEventBySlug` with `and(eq(events.status, "published"), eq(events.visibility, "public"), …)`. In `listMemberEvents` replace the `published` filter with `and(eq(events.status, "published"), inArray(events.visibility, ["public", "members_only"]))`. In `getEventBySlug` replace the anonymous test with `row.status === "published" && row.visibility === "public"` and the member test with `row.status === "published" && row.visibility !== "invite_only"`.

Extend `eventInputObjectSchema` (all optional so the admin form keeps working unchanged):

```ts
  status: z.enum(["draft", "pending_review", "published", "rejected", "cancelled"]).optional(),
  visibility: z.enum(["public", "members_only", "invite_only"]).optional(),
  format: z.enum(["in_person", "online", "hybrid"]).default("in_person"),
  onlineUrl: z.string().trim().url().max(500).nullable().optional(),
  registrationMode: z.enum(["rsvp", "external", "ticketed"]).default("rsvp"),
  externalRegistrationUrl: z.string().trim().url().max(500).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
```

and where the file adds its `endsAt > startsAt` refinement, add two more issues: `format !== "in_person" && !onlineUrl` → path `["onlineUrl"]`, message `"onlineUrl is required for online and hybrid events"`; `registrationMode === "external" && !externalRegistrationUrl` → path `["externalRegistrationUrl"]`, message `"externalRegistrationUrl is required for external registration"`.

Add a module-level helper and use it in `createEvent` and `updateEvent`:

```ts
/**
 * Admin forms still send `published`/`memberOnly`; member forms send
 * `status`/`visibility`. Whichever arrives, both pairs are written (D-12).
 */
export function reconciledEventFlags(
  input: Readonly<{published?: boolean; memberOnly?: boolean; status?: EventStatus; visibility?: EventVisibility}>,
  current?: Readonly<{status: EventStatus; visibility: EventVisibility}>,
): Readonly<{status: EventStatus; visibility: EventVisibility; published: boolean; memberOnly: boolean}> {
  const fallbackStatus = current?.status ?? "draft";
  const status: EventStatus = input.status
    ?? (input.published === undefined ? fallbackStatus : input.published ? "published" : (fallbackStatus === "published" ? "draft" : fallbackStatus));
  const visibility: EventVisibility = input.visibility
    ?? (input.memberOnly === undefined ? (current?.visibility ?? "public") : input.memberOnly ? "members_only" : "public");
  return {status, visibility, ...derivedEventFlags({status, visibility})};
}
```

In `createEvent`, spread `...reconciledEventFlags(parsed)` into the insert values and set `publishedAt: flags.status === "published" ? new Date() : null`. In `updateEvent`, spread `...reconciledEventFlags(parsed, {status: current.status, visibility: current.visibility})` (the locked row is already loaded there) and set `publishedAt: flags.status === "published" ? (current.publishedAt ?? new Date()) : null`.

- [ ] **Step 5: Add the member and review methods**

Append before the `eventsRepository` facade:

```ts
export type MemberEventDependencies = Readonly<{
  loadDatabase?: AutomationDatabaseLoader;
  getCompanyRole?: (actor: Actor, companyId: string) => Promise<CompanyRole | null>;
  now?: () => Date;
}>;

const memberEventInputSchema = eventInputObjectSchema
  .omit({published: true, memberOnly: true, status: true})
  .extend({visibility: z.enum(["public", "members_only"]), heroMediaId: z.string().uuid().nullable()})
  .strict()
  .superRefine((value, context) => {
    if (value.endsAt && value.endsAt <= value.startsAt) context.addIssue({code: z.ZodIssueCode.custom, path: ["endsAt"], message: "endsAt must be after startsAt"});
    if (value.format !== "in_person" && !value.onlineUrl) context.addIssue({code: z.ZodIssueCode.custom, path: ["onlineUrl"], message: "onlineUrl is required for online and hybrid events"});
    if (value.registrationMode === "external" && !value.externalRegistrationUrl) context.addIssue({code: z.ZodIssueCode.custom, path: ["externalRegistrationUrl"], message: "externalRegistrationUrl is required for external registration"});
  });

export type MemberEventInput = z.input<typeof memberEventInputSchema>;

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows as Record<string, unknown>[];
  return [];
}

async function memberDatabase(deps: MemberEventDependencies): Promise<AutomationDatabase> {
  return deps.loadDatabase ? deps.loadDatabase() : (await getDb() as unknown as AutomationDatabase);
}

async function requireCompanyManager(actor: Actor, companyId: string, deps: MemberEventDependencies): Promise<Extract<Actor, {kind: "member"}>> {
  requireMember(actor);
  const role = await (deps.getCompanyRole ?? portalContentRepository.getCompanyRole)(actor, companyId);
  if (role !== "owner" && role !== "admin") throw new Error("FORBIDDEN");
  return actor;
}

async function upsertMemberEvent(actor: Extract<Actor, {kind: "member"}>, companyId: string, input: unknown, status: "draft" | "pending_review", deps: MemberEventDependencies): Promise<Event> {
  const parsed = memberEventInputSchema.parse(input);
  const flags = derivedEventFlags({status, visibility: parsed.visibility});
  const now = (deps.now ?? (() => new Date()))();
  const company = z.string().uuid().parse(companyId);
  const database = await memberDatabase(deps);
  // One statement: insert, or update only a row this company organises that
  // may still move to `status`. A slug held by anyone else yields no row.
  const row = rowsFrom(await database.execute(sql`
    INSERT INTO ${events}
      (slug, title_en, title_zh, description_en, description_zh, starts_at, ends_at, venue, capacity,
       member_only, published, hero_media_id, organiser_company_id, submitted_by_profile_id, submitted_at,
       status, visibility, format, online_url, registration_mode, external_registration_url, tags)
    VALUES
      (${parsed.slug}, ${parsed.titleEn}, ${parsed.titleZh ?? null}, ${parsed.descriptionEn}, ${parsed.descriptionZh ?? null},
       ${parsed.startsAt}, ${parsed.endsAt ?? null}, ${parsed.venue ?? null}, ${parsed.capacity ?? null},
       ${flags.memberOnly}, ${flags.published}, ${parsed.heroMediaId}, ${company}, ${actor.profileId},
       ${status === "pending_review" ? now : null}, ${status}, ${parsed.visibility}, ${parsed.format}, ${parsed.onlineUrl ?? null},
       ${parsed.registrationMode}, ${parsed.externalRegistrationUrl ?? null}, ${parsed.tags}::text[])
    ON CONFLICT (slug) DO UPDATE SET
      title_en = EXCLUDED.title_en, title_zh = EXCLUDED.title_zh, description_en = EXCLUDED.description_en,
      description_zh = EXCLUDED.description_zh, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
      venue = EXCLUDED.venue, capacity = EXCLUDED.capacity, member_only = EXCLUDED.member_only,
      published = EXCLUDED.published, hero_media_id = EXCLUDED.hero_media_id,
      submitted_by_profile_id = EXCLUDED.submitted_by_profile_id,
      submitted_at = COALESCE(EXCLUDED.submitted_at, ${events.submittedAt}),
      status = EXCLUDED.status, visibility = EXCLUDED.visibility, format = EXCLUDED.format,
      online_url = EXCLUDED.online_url, registration_mode = EXCLUDED.registration_mode,
      external_registration_url = EXCLUDED.external_registration_url, tags = EXCLUDED.tags,
      reviewed_at = NULL, reviewed_by_profile_id = NULL, rejection_reason = NULL, updated_at = now()
    WHERE ${events.organiserCompanyId} = ${company} AND ${events.status} IN ('draft', 'rejected', 'pending_review')
    RETURNING *
  `))[0];
  if (!row) throw new Error("EVENT_SLUG_TAKEN");
  return row as unknown as Event;
}

export async function saveMemberEventDraft(actor: Actor, companyId: string, input: unknown, deps: MemberEventDependencies = {}): Promise<Event> {
  const member = await requireCompanyManager(actor, companyId, deps);
  return upsertMemberEvent(member, companyId, input, "draft", deps);
}

export async function submitMemberEvent(
  actor: Actor, companyId: string, input: unknown,
  deps: MemberEventDependencies & Readonly<{plan: MembershipPlanCode; usedThisQuarter: number}>,
): Promise<Event> {
  const member = await requireCompanyManager(actor, companyId, deps);
  assertCanSubmitEvent(deps.plan, deps.usedThisQuarter);
  return upsertMemberEvent(member, companyId, input, "pending_review", deps);
}

export async function listCompanyEvents(actor: Actor, companyId: string, deps: MemberEventDependencies = {}): Promise<Event[]> {
  await requireCompanyManager(actor, companyId, deps);
  const database = await memberDatabase(deps);
  return rowsFrom(await database.execute(sql`
    SELECT * FROM ${events} WHERE ${events.organiserCompanyId} = ${z.string().uuid().parse(companyId)}
    ORDER BY ${events.startsAt} DESC, ${events.slug} ASC
  `)) as unknown as Event[];
}

export async function getEventForMemberEdit(actor: Actor, eventId: string, deps: MemberEventDependencies = {}): Promise<Event | null> {
  requireMember(actor);
  const id = z.string().uuid().parse(eventId);
  const database = await memberDatabase(deps);
  const row = rowsFrom(await database.execute(sql`SELECT * FROM ${events} WHERE ${events.id} = ${id}`))[0];
  if (!row) return null;
  const organiser = row.organiser_company_id ?? row.organiserCompanyId;
  if (typeof organiser !== "string") throw new Error("FORBIDDEN");
  await requireCompanyManager(actor, organiser, deps);
  return row as unknown as Event;
}

/** S-4: submissions this Hong Kong calendar quarter that went past draft and were not rejected. */
export async function countCompanySubmissionsThisQuarter(actor: Actor, companyId: string, deps: MemberEventDependencies = {}): Promise<number> {
  await requireCompanyManager(actor, companyId, deps);
  const {start, end} = hongKongQuarterBounds((deps.now ?? (() => new Date()))());
  const database = await memberDatabase(deps);
  const row = rowsFrom(await database.execute(sql`
    SELECT count(*)::int AS count FROM ${events}
    WHERE ${events.organiserCompanyId} = ${z.string().uuid().parse(companyId)}
      AND ${events.submittedAt} >= ${start} AND ${events.submittedAt} < ${end}
      AND ${events.status} IN ('pending_review', 'published', 'cancelled')
  `))[0];
  return Number(row?.count ?? 0);
}

const reviewDecisionSchema = z.discriminatedUnion("decision", [
  z.object({decision: z.literal("approve")}).strict(),
  z.object({decision: z.literal("reject"), reason: z.string().trim().min(1).max(1_000)}).strict(),
]);

export async function reviewEvent(actor: Actor, eventId: string, decision: unknown, deps: MemberEventDependencies = {}): Promise<Event> {
  requireAdmin(actor);
  const id = z.string().uuid().parse(eventId);
  const parsed = reviewDecisionSchema.parse(decision);
  const database = await memberDatabase(deps);
  return database.transaction(async (transaction) => {
    const current = rowsFrom(await transaction.execute(sql`SELECT * FROM ${events} WHERE ${events.id} = ${id} FOR UPDATE`))[0];
    if (!current) throw new Error("EVENT_NOT_FOUND");
    const currentStatus = String(current.status) as EventStatus;
    const visibility = String(current.visibility ?? "public") as EventVisibility;
    const next: EventStatus = parsed.decision === "approve" ? "published" : "rejected";
    if (!canTransitionEvent(currentStatus, next)) throw new Error("INVALID_EVENT_TRANSITION");
    const flags = derivedEventFlags({status: next, visibility});
    const reason = parsed.decision === "reject" ? parsed.reason : null;
    const updated = rowsFrom(await transaction.execute(sql`
      UPDATE ${events}
      SET status = ${next}, published = ${flags.published}, member_only = ${flags.memberOnly},
          published_at = CASE WHEN ${next} = 'published' THEN COALESCE(${events.publishedAt}, now()) ELSE ${events.publishedAt} END,
          reviewed_at = now(), reviewed_by_profile_id = ${actor.profileId}, rejection_reason = ${reason}, updated_at = now()
      WHERE ${events.id} = ${id}
      RETURNING *
    `))[0];
    await transaction.execute(sql`
      INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata)
      VALUES (${actor.profileId}, ${actor.kind}, ${parsed.decision === "approve" ? "event.review.approved" : "event.review.rejected"}, 'event', ${id},
              ${JSON.stringify({slug: current.slug, organiserCompanyId: current.organiser_company_id ?? null, reason})}::jsonb)
    `);
    return updated as unknown as Event;
  });
}

export async function listEventsForReview(actor: Actor, deps: MemberEventDependencies = {}): Promise<Event[]> {
  requireAdmin(actor);
  const database = await memberDatabase(deps);
  return rowsFrom(await database.execute(sql`
    SELECT * FROM ${events} WHERE ${events.status} = 'pending_review'
    ORDER BY ${events.submittedAt} ASC NULLS LAST, ${events.slug} ASC
  `)) as unknown as Event[];
}
```

Add to the `eventsRepository` facade: `saveMemberDraft: saveMemberEventDraft, submitMember: submitMemberEvent, listForCompany: listCompanyEvents, getForMemberEdit: getEventForMemberEdit, countCompanySubmissionsThisQuarter, review: reviewEvent, listForReview: listEventsForReview`.

Rows from raw `execute` arrive snake_case. Later tasks that render them map the few fields they need explicitly (see Task 3's `memberEventView`); do not pass raw rows into `localizeEvent`.

- [ ] **Step 6: Run the events suites, typecheck, lint**

Run: `npx vitest run tests/unit/event-status.test.ts tests/unit/event-entitlement.test.ts tests/unit/member-event-repository.test.ts tests/unit/public-event-repository.test.ts tests/unit/admin-events.test.ts tests/unit/event-public-projection-and-registration-review.test.ts tests/unit/featured-public-event-query.test.ts tests/unit/repository-production-security.test.ts tests/unit/server-action-actor-boundary.test.ts --reporter=dot && npm run typecheck && npx eslint lib/db/repos/events.ts lib/events tests/unit/event-status.test.ts tests/unit/event-entitlement.test.ts tests/unit/member-event-repository.test.ts`
Expected: PASS. Where an existing fixture row lacks `status`/`visibility`, add `status: "published", visibility: "public"` for `published: true` rows and `status: "draft", visibility: "public"` otherwise; do not weaken any assertion.

- [ ] **Step 7: Commit**

```bash
git add lib/events/status.ts lib/events/entitlement-core.ts lib/db/repos/events.ts tests/unit/event-status.test.ts tests/unit/event-entitlement.test.ts tests/unit/member-event-repository.test.ts tests/unit/public-event-repository.test.ts tests/unit/admin-events.test.ts tests/unit/repository-production-security.test.ts tests/unit/event-public-projection-and-registration-review.test.ts tests/unit/featured-public-event-query.test.ts
git commit -m "feat(events): status-driven reads, member drafts and submission, staff review with audit, quarterly entitlement (B-1, D-5, D-12)"
```

---

### Task 3: Portal event publishing — contract, core, actions, form, pages (B-2)

**Files:**
- Create: `lib/events/member-contract.ts`, `lib/events/member-core.ts`, `lib/events/member-actions.ts`, `components/portal/event-form.tsx`, `app/[locale]/(member)/portal/events/new/page.tsx`, `app/[locale]/(member)/portal/events/[id]/edit/page.tsx`
- Modify: `app/[locale]/(member)/portal/events/page.tsx` (add "Your company's events" list + "Submit an event" link), `messages/en.json`, `messages/zh-HK.json` (`Portal.memberEvents`)
- Test: `tests/unit/member-event-contract.test.ts`, `tests/unit/member-event-core.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/member-event-contract.test.ts
import {describe, expect, it} from "vitest";

import {memberEventInputFromFormData, memberEventViewFromRow} from "@/lib/events/member-contract";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe("member event contract (programme B-2)", () => {
  it("reads Hong Kong datetime-local fields, comma tags and optional urls", () => {
    const input = memberEventInputFromFormData(form({
      slug: "ai-clinic-2026", titleEn: "AI Clinic", titleZh: "", descriptionEn: "Hands-on", descriptionZh: "",
      startsAt: "2030-03-01T10:00", endsAt: "2030-03-01T12:00", venue: "KOHO", capacity: "40",
      format: "hybrid", onlineUrl: "https://meet.example/x", visibility: "public", registrationMode: "rsvp",
      externalRegistrationUrl: "", tags: "ai, health ,", heroMediaId: "",
    }));
    expect(input).toMatchObject({slug: "ai-clinic-2026", titleZh: null, capacity: 40, format: "hybrid", tags: ["ai", "health"], heroMediaId: null, externalRegistrationUrl: null});
    expect(input.startsAt.toISOString()).toBe("2030-03-01T02:00:00.000Z");
    expect(input.endsAt?.toISOString()).toBe("2030-03-01T04:00:00.000Z");
  });

  it("maps a snake_case row to the edit view", () => {
    const view = memberEventViewFromRow({
      id: "22222222-2222-4222-8222-222222222222", slug: "x", title_en: "X", title_zh: null, description_en: "d", description_zh: null,
      starts_at: "2030-03-01T02:00:00.000Z", ends_at: null, venue: null, capacity: null, status: "rejected", visibility: "public",
      format: "in_person", online_url: null, registration_mode: "rsvp", external_registration_url: null, tags: ["ai"],
      hero_media_id: null, rejection_reason: "duplicate", submitted_at: null, published_at: null,
    });
    expect(view).toMatchObject({id: "22222222-2222-4222-8222-222222222222", status: "rejected", rejectionReason: "duplicate", startsAtLocal: "2030-03-01T10:00", tags: "ai"});
  });
});
```

```ts
// tests/unit/member-event-core.test.ts
import {describe, expect, it, vi} from "vitest";

import {loadMemberEventsContext, saveMemberEvent} from "@/lib/events/member-core";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const member = {kind: "member" as const, userId: "u", profileId: "member-1"};

const input = {
  slug: "ai-clinic-2026", titleEn: "AI Clinic", titleZh: null, descriptionEn: "d", descriptionZh: null,
  startsAt: new Date("2030-03-01T02:00:00Z"), endsAt: null, venue: null, capacity: null, format: "in_person" as const,
  onlineUrl: null, visibility: "public" as const, registrationMode: "rsvp" as const, externalRegistrationUrl: null, tags: [], heroMediaId: null,
};

function deps(plan = "startup") {
  return {
    events: {
      saveMemberDraft: vi.fn(async () => ({id: "e1", status: "draft"})),
      submitMember: vi.fn(async () => ({id: "e1", status: "pending_review"})),
      countCompanySubmissionsThisQuarter: vi.fn(async () => 1),
      listForCompany: vi.fn(async () => []),
    },
    dashboard: vi.fn(async () => ({
      companies: [{id: COMPANY, canManage: true, displayName: "Acme"}],
      memberships: [{planCode: plan, status: "active", companyId: COMPANY}],
    })),
  };
}

describe("member event core (programme B-2)", () => {
  it("resolves the member's company, plan and remaining quota", async () => {
    const d = deps();
    const context = await loadMemberEventsContext(member, d as never);
    expect(context).toMatchObject({companyId: COMPANY, plan: "startup", usedThisQuarter: 1, limit: 2, canPublish: true});
  });

  it("saves a draft without a quota check and submits with one", async () => {
    const d = deps();
    await saveMemberEvent(member, "draft", input, d as never);
    expect(d.events.saveMemberDraft).toHaveBeenCalledWith(member, COMPANY, input);
    await saveMemberEvent(member, "submit", input, d as never);
    expect(d.events.submitMember).toHaveBeenCalledWith(member, COMPANY, input, {plan: "startup", usedThisQuarter: 1});
  });

  it("refuses when the member manages no company", async () => {
    const d = deps();
    d.dashboard.mockResolvedValueOnce({companies: [], memberships: []});
    await expect(saveMemberEvent(member, "draft", input, d as never)).rejects.toThrow("NO_MANAGED_COMPANY");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/member-event-contract.test.ts tests/unit/member-event-core.test.ts --reporter=dot`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the contract**

```ts
// lib/events/member-contract.ts
import {formatHongKongDateTimeLocal, parseHongKongDateTimeLocal} from "@/lib/admin/event-form-input";
import type {MemberEventInput} from "@/lib/db/repos/events";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
function optional(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value.length > 0 ? value : null;
}

/** FormData → repository input. Dates are Hong Kong wall-clock `datetime-local` values (same parser as the admin form). */
export function memberEventInputFromFormData(formData: FormData): MemberEventInput {
  const capacity = optional(formData, "capacity");
  const endsAt = optional(formData, "endsAt");
  const format = text(formData, "format");
  const visibility = text(formData, "visibility");
  const registrationMode = text(formData, "registrationMode");
  return {
    slug: text(formData, "slug"),
    titleEn: text(formData, "titleEn"),
    titleZh: optional(formData, "titleZh"),
    descriptionEn: text(formData, "descriptionEn"),
    descriptionZh: optional(formData, "descriptionZh"),
    startsAt: parseHongKongDateTimeLocal(text(formData, "startsAt")),
    endsAt: endsAt ? parseHongKongDateTimeLocal(endsAt) : null,
    venue: optional(formData, "venue"),
    capacity: capacity ? Number(capacity) : null,
    format: (format === "online" || format === "hybrid" ? format : "in_person"),
    onlineUrl: optional(formData, "onlineUrl"),
    visibility: visibility === "members_only" ? "members_only" : "public",
    registrationMode: registrationMode === "external" ? "external" : "rsvp",
    externalRegistrationUrl: optional(formData, "externalRegistrationUrl"),
    tags: text(formData, "tags").split(",").map((tag) => tag.trim()).filter((tag) => tag.length > 0),
    heroMediaId: optional(formData, "heroMediaId"),
  };
}

export type MemberEventView = Readonly<{
  id: string; slug: string; titleEn: string; titleZh: string; descriptionEn: string; descriptionZh: string;
  startsAtLocal: string; endsAtLocal: string; venue: string; capacity: string; status: string; visibility: string;
  format: string; onlineUrl: string; registrationMode: string; externalRegistrationUrl: string; tags: string;
  heroMediaId: string; rejectionReason: string | null; submittedAt: string | null; publishedAt: string | null;
}>;

const asString = (value: unknown): string => (typeof value === "string" ? value : "");
const asDateLocal = (value: unknown): string => {
  if (value instanceof Date) return formatHongKongDateTimeLocal(value);
  if (typeof value === "string" && value) return formatHongKongDateTimeLocal(new Date(value));
  return "";
};

/** Snake-case repository row → form defaults. */
export function memberEventViewFromRow(row: Record<string, unknown>): MemberEventView {
  return {
    id: asString(row.id), slug: asString(row.slug), titleEn: asString(row.title_en), titleZh: asString(row.title_zh),
    descriptionEn: asString(row.description_en), descriptionZh: asString(row.description_zh),
    startsAtLocal: asDateLocal(row.starts_at), endsAtLocal: asDateLocal(row.ends_at), venue: asString(row.venue),
    capacity: row.capacity === null || row.capacity === undefined ? "" : String(row.capacity),
    status: asString(row.status), visibility: asString(row.visibility) || "public", format: asString(row.format) || "in_person",
    onlineUrl: asString(row.online_url), registrationMode: asString(row.registration_mode) || "rsvp",
    externalRegistrationUrl: asString(row.external_registration_url),
    tags: Array.isArray(row.tags) ? row.tags.map(String).join(", ") : "",
    heroMediaId: asString(row.hero_media_id), rejectionReason: typeof row.rejection_reason === "string" ? row.rejection_reason : null,
    submittedAt: typeof row.submitted_at === "string" ? row.submitted_at : row.submitted_at instanceof Date ? row.submitted_at.toISOString() : null,
    publishedAt: typeof row.published_at === "string" ? row.published_at : row.published_at instanceof Date ? row.published_at.toISOString() : null,
  };
}
```

- [ ] **Step 4: Write the core and the `"use server"` wrappers**

```ts
// lib/events/member-core.ts
import "server-only";

import {eventsRepository} from "@/lib/db/repos/events";
import {entitlementsFor} from "@/lib/membership/entitlements";
import type {MembershipPlanCode} from "@/lib/membership/constants";
import type {Actor} from "@/lib/membership/lifecycle";
import {requireMember} from "@/lib/membership/lifecycle";
import {getDashboard} from "@/lib/portal/queries";

export type MemberEventsDependencies = Readonly<{
  events: Pick<typeof eventsRepository, "saveMemberDraft" | "submitMember" | "countCompanySubmissionsThisQuarter" | "listForCompany">;
  dashboard: (actor: Actor) => Promise<Readonly<{
    companies: readonly Readonly<{id: string; canManage: boolean; displayName: string}>[];
    memberships: readonly Readonly<{planCode: string; status: string; companyId: string | null}>[];
  }>>;
}>;

const defaultDependencies: MemberEventsDependencies = {events: eventsRepository, dashboard: getDashboard};

export type MemberEventsContext = Readonly<{
  companyId: string; companyName: string; plan: MembershipPlanCode; usedThisQuarter: number; limit: number; canPublish: boolean;
}>;

/** The first company the member manages, its plan, and the quota already used this quarter (S-4). */
export async function loadMemberEventsContext(actor: Actor, deps: MemberEventsDependencies = defaultDependencies): Promise<MemberEventsContext> {
  requireMember(actor);
  const dashboard = await deps.dashboard(actor);
  const company = dashboard.companies.find((entry) => entry.canManage);
  if (!company) throw new Error("NO_MANAGED_COMPANY");
  const membership = dashboard.memberships.find((entry) => entry.companyId === company.id) ?? dashboard.memberships[0];
  const plan = (membership?.planCode ?? "community") as MembershipPlanCode;
  const usedThisQuarter = await deps.events.countCompanySubmissionsThisQuarter(actor, company.id);
  const limit = entitlementsFor(plan).publishEventsPerQuarter;
  return {companyId: company.id, companyName: company.displayName, plan, usedThisQuarter, limit, canPublish: limit > 0 && usedThisQuarter < limit};
}

export async function saveMemberEvent(actor: Actor, mode: "draft" | "submit", input: unknown, deps: MemberEventsDependencies = defaultDependencies) {
  const context = await loadMemberEventsContext(actor, deps);
  if (mode === "draft") return deps.events.saveMemberDraft(actor, context.companyId, input);
  return deps.events.submitMember(actor, context.companyId, input, {plan: context.plan, usedThisQuarter: context.usedThisQuarter});
}

export async function listMyCompanyEvents(actor: Actor, deps: MemberEventsDependencies = defaultDependencies) {
  const context = await loadMemberEventsContext(actor, deps);
  return {context, events: await deps.events.listForCompany(actor, context.companyId)};
}
```

```ts
// lib/events/member-actions.ts
"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";

import {memberEventInputFromFormData} from "@/lib/events/member-contract";
import {saveMemberEvent} from "@/lib/events/member-core";
import {localizedPath} from "@/lib/urls";

export type MemberEventFormState = Readonly<{status: "idle" | "error"; code?: string}>;

async function run(mode: "draft" | "submit", locale: "en" | "zh-HK", formData: FormData): Promise<MemberEventFormState> {
  const {requireActor} = await import("@/lib/auth/actor");
  const actor = await requireActor();
  try {
    const event = await saveMemberEvent(actor, mode, memberEventInputFromFormData(formData));
    revalidatePath(`/${locale}/portal/events`);
    revalidatePath(`/${locale}/portal/events/${event.id}/edit`);
    redirect(`${localizedPath(locale, `/portal/events/${event.id}/edit`)}?saved=${mode}`);
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    const code = error instanceof Error ? error.message : "UNKNOWN";
    return {status: "error", code: code.startsWith("EVENT_") || code === "NO_MANAGED_COMPANY" || code === "FORBIDDEN" ? code : "INVALID"};
  }
}

export async function saveMemberEventDraftAction(locale: "en" | "zh-HK", _state: MemberEventFormState, formData: FormData): Promise<MemberEventFormState> {
  return run("draft", locale, formData);
}

export async function submitMemberEventAction(locale: "en" | "zh-HK", _state: MemberEventFormState, formData: FormData): Promise<MemberEventFormState> {
  return run("submit", locale, formData);
}
```

`redirect` throws `NEXT_REDIRECT`; the `catch` re-throws it, matching `app/[locale]/(join)/join/actions.ts`. Both exports are async, take no actor, and are bound with `locale` from the page.

- [ ] **Step 5: Write the form and the pages**

```tsx
// components/portal/event-form.tsx
"use client";

import {useActionState} from "react";

import type {MemberEventView} from "@/lib/events/member-contract";
import type {MemberEventFormState} from "@/lib/events/member-actions";

export type EventFormLabels = Readonly<{
  slug: string; titleEn: string; titleZh: string; descriptionEn: string; descriptionZh: string; startsAt: string; endsAt: string;
  venue: string; capacity: string; format: string; formats: Readonly<{in_person: string; online: string; hybrid: string}>;
  onlineUrl: string; visibility: string; visibilities: Readonly<{public: string; members_only: string}>;
  registrationMode: string; registrationModes: Readonly<{rsvp: string; external: string}>; externalRegistrationUrl: string;
  tags: string; heroMediaId: string; heroHelp: string; saveDraft: string; submit: string; saving: string;
  errors: Readonly<Record<string, string>>;
}>;

type Action = (state: MemberEventFormState, formData: FormData) => Promise<MemberEventFormState>;
const initial: MemberEventFormState = {status: "idle"};
const input = "min-h-11 w-full rounded-md border border-input bg-background px-3";

export function EventForm({values, labels, draftAction, submitAction, canSubmit}: Readonly<{
  values: MemberEventView | null; labels: EventFormLabels; draftAction: Action; submitAction: Action; canSubmit: boolean;
}>) {
  const [draftState, draft, draftPending] = useActionState(draftAction, initial);
  const [submitState, submit, submitPending] = useActionState(submitAction, initial);
  const state = submitState.status === "error" ? submitState : draftState;
  const pending = draftPending || submitPending;
  const field = (name: keyof MemberEventView, label: string, type = "text", extra: Record<string, unknown> = {}) => (
    <label className="space-y-2 text-sm font-medium"><span>{label}</span><input className={input} defaultValue={values?.[name] ?? ""} name={name} type={type} {...extra} /></label>
  );
  return (
    <form action={submit} className="glass-card grid gap-5 p-5 sm:grid-cols-2 sm:p-8" noValidate>
      {field("slug", labels.slug, "text", {required: true, pattern: "[a-z0-9]+(?:-[a-z0-9]+)*"})}
      {field("titleEn", labels.titleEn, "text", {required: true})}
      {field("titleZh", labels.titleZh)}
      <label className="space-y-2 text-sm font-medium sm:col-span-2"><span>{labels.descriptionEn}</span><textarea className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2" defaultValue={values?.descriptionEn ?? ""} name="descriptionEn" required /></label>
      <label className="space-y-2 text-sm font-medium sm:col-span-2"><span>{labels.descriptionZh}</span><textarea className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2" defaultValue={values?.descriptionZh ?? ""} name="descriptionZh" /></label>
      {field("startsAtLocal", labels.startsAt, "datetime-local", {name: "startsAt", required: true})}
      {field("endsAtLocal", labels.endsAt, "datetime-local", {name: "endsAt"})}
      {field("venue", labels.venue)}
      {field("capacity", labels.capacity, "number", {min: 1})}
      <label className="space-y-2 text-sm font-medium"><span>{labels.format}</span>
        <select className={input} defaultValue={values?.format ?? "in_person"} name="format">
          {(["in_person", "online", "hybrid"] as const).map((key) => <option key={key} value={key}>{labels.formats[key]}</option>)}
        </select></label>
      {field("onlineUrl", labels.onlineUrl, "url")}
      <label className="space-y-2 text-sm font-medium"><span>{labels.visibility}</span>
        <select className={input} defaultValue={values?.visibility ?? "public"} name="visibility">
          {(["public", "members_only"] as const).map((key) => <option key={key} value={key}>{labels.visibilities[key]}</option>)}
        </select></label>
      <label className="space-y-2 text-sm font-medium"><span>{labels.registrationMode}</span>
        <select className={input} defaultValue={values?.registrationMode ?? "rsvp"} name="registrationMode">
          {(["rsvp", "external"] as const).map((key) => <option key={key} value={key}>{labels.registrationModes[key]}</option>)}
        </select></label>
      {field("externalRegistrationUrl", labels.externalRegistrationUrl, "url")}
      {field("tags", labels.tags)}
      <label className="space-y-2 text-sm font-medium sm:col-span-2"><span>{labels.heroMediaId}</span><input className={input} defaultValue={values?.heroMediaId ?? ""} name="heroMediaId" type="text" /><span className="block text-xs text-muted-foreground">{labels.heroHelp}</span></label>
      {state.status === "error" ? <p className="text-sm text-destructive sm:col-span-2" role="alert">{labels.errors[state.code ?? "INVALID"] ?? labels.errors.INVALID}</p> : null}
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <button className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium" disabled={pending} formAction={draft} type="submit">{pending ? labels.saving : labels.saveDraft}</button>
        <button className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60" disabled={pending || !canSubmit} type="submit">{pending ? labels.saving : labels.submit}</button>
      </div>
    </form>
  );
}
```

The `field` helper passes `name` through `extra` for the two date inputs so the posted names are `startsAt`/`endsAt` while defaults come from `startsAtLocal`/`endsAtLocal`. The hero field is a media id typed or pasted from the upload widget added in Task 4.

```tsx
// app/[locale]/(member)/portal/events/new/page.tsx
import {getTranslations, setRequestLocale} from "next-intl/server";
import {redirect} from "next/navigation";

import {EventForm} from "@/components/portal/event-form";
import type {AppLocale} from "@/i18n/routing";
import {getActor} from "@/lib/auth/actor";
import {saveMemberEventDraftAction, submitMemberEventAction} from "@/lib/events/member-actions";
import {loadMemberEventsContext} from "@/lib/events/member-core";
import {localizedPath} from "@/lib/urls";

import {eventFormLabels} from "../labels";

export const dynamic = "force-dynamic";
type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function NewMemberEventPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await getActor();
  if (!actor) redirect(`${localizedPath(locale, "/member-login")}?next=${encodeURIComponent("/portal/events/new")}`);
  const t = await getTranslations({locale, namespace: "Portal.memberEvents"});
  const context = await loadMemberEventsContext(actor).catch(() => null);
  if (!context) return <p className="text-muted-foreground">{t("noCompany")}</p>;
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight">{t("newTitle")}</h1>
        <p className="text-muted-foreground">{t("quota", {used: context.usedThisQuarter, limit: Number.isFinite(context.limit) ? String(context.limit) : t("unlimited")})}</p>
      </header>
      <EventForm canSubmit={context.canPublish} draftAction={saveMemberEventDraftAction.bind(null, locale)} labels={eventFormLabels(t)} submitAction={submitMemberEventAction.bind(null, locale)} values={null} />
    </div>
  );
}
```

```ts
// app/[locale]/(member)/portal/events/labels.ts
import type {EventFormLabels} from "@/components/portal/event-form";

type Translate = (key: string, values?: Record<string, string | number>) => string;

export function eventFormLabels(t: Translate): EventFormLabels {
  return {
    slug: t("fields.slug"), titleEn: t("fields.titleEn"), titleZh: t("fields.titleZh"), descriptionEn: t("fields.descriptionEn"), descriptionZh: t("fields.descriptionZh"),
    startsAt: t("fields.startsAt"), endsAt: t("fields.endsAt"), venue: t("fields.venue"), capacity: t("fields.capacity"), format: t("fields.format"),
    formats: {in_person: t("formats.in_person"), online: t("formats.online"), hybrid: t("formats.hybrid")},
    onlineUrl: t("fields.onlineUrl"), visibility: t("fields.visibility"), visibilities: {public: t("visibilities.public"), members_only: t("visibilities.members_only")},
    registrationMode: t("fields.registrationMode"), registrationModes: {rsvp: t("registrationModes.rsvp"), external: t("registrationModes.external")},
    externalRegistrationUrl: t("fields.externalRegistrationUrl"), tags: t("fields.tags"), heroMediaId: t("fields.heroMediaId"), heroHelp: t("fields.heroHelp"),
    saveDraft: t("saveDraft"), submit: t("submit"), saving: t("saving"),
    errors: {INVALID: t("errors.INVALID"), EVENT_SLUG_TAKEN: t("errors.EVENT_SLUG_TAKEN"), EVENT_QUOTA_EXCEEDED: t("errors.EVENT_QUOTA_EXCEEDED"), EVENT_PUBLISHING_NOT_INCLUDED: t("errors.EVENT_PUBLISHING_NOT_INCLUDED"), NO_MANAGED_COMPANY: t("errors.NO_MANAGED_COMPANY"), FORBIDDEN: t("errors.FORBIDDEN")},
  };
}
```

```tsx
// app/[locale]/(member)/portal/events/[id]/edit/page.tsx
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound, redirect} from "next/navigation";

import {EventForm} from "@/components/portal/event-form";
import type {AppLocale} from "@/i18n/routing";
import {getActor} from "@/lib/auth/actor";
import {eventsRepository} from "@/lib/db/repos/events";
import {saveMemberEventDraftAction, submitMemberEventAction} from "@/lib/events/member-actions";
import {memberEventViewFromRow} from "@/lib/events/member-contract";
import {loadMemberEventsContext} from "@/lib/events/member-core";
import {localizedPath} from "@/lib/urls";

import {eventFormLabels} from "../../labels";

export const dynamic = "force-dynamic";
type Props = Readonly<{params: Promise<{locale: string; id: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}>;

export default async function EditMemberEventPage({params, searchParams}: Props) {
  const {locale: localeValue, id} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await getActor();
  if (!actor) redirect(`${localizedPath(locale, "/member-login")}?next=${encodeURIComponent(`/portal/events/${id}/edit`)}`);
  const t = await getTranslations({locale, namespace: "Portal.memberEvents"});
  const row = await eventsRepository.getForMemberEdit(actor, id).catch(() => null);
  if (!row) notFound();
  const values = memberEventViewFromRow(row as unknown as Record<string, unknown>);
  const context = await loadMemberEventsContext(actor).catch(() => null);
  const saved = (await searchParams).saved;
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t(`status.${values.status}`)}</p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight">{values.titleEn}</h1>
        {saved === "submit" ? <p className="text-muted-foreground" role="status">{t("submitted")}</p> : saved === "draft" ? <p className="text-muted-foreground" role="status">{t("draftSaved")}</p> : null}
        {values.rejectionReason ? <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{t("rejectedWith", {reason: values.rejectionReason})}</p> : null}
      </header>
      <EventForm canSubmit={Boolean(context?.canPublish) || values.status === "pending_review"} draftAction={saveMemberEventDraftAction.bind(null, locale)} labels={eventFormLabels(t)} submitAction={submitMemberEventAction.bind(null, locale)} values={values} />
    </div>
  );
}
```

In `app/[locale]/(member)/portal/events/page.tsx`, after the existing registration list, add a "Your company's events" section: call `listMyCompanyEvents(actor).catch(() => null)`; when non-null render a `<Link href={localizedPath(locale, "/portal/events/new")}>{t("memberEvents.newAction")}</Link>` and a list of `events.map(memberEventViewFromRow)` rows with title, `t(\`memberEvents.status.${status}\`)` and a link to `localizedPath(locale, \`/portal/events/${id}/edit\`)`; when null (no managed company) render nothing. Import `Link` from `next/link`.

- [ ] **Step 6: Strings**

`messages/en.json` → inside `"Portal"` add:

```json
"memberEvents": {
  "eyebrow": "Your organisation's events",
  "newTitle": "Submit an event",
  "newAction": "Submit an event",
  "listTitle": "Events your organisation has submitted",
  "noCompany": "Event publishing needs a company you manage. Ask your company owner to make you an admin.",
  "quota": "{used} of {limit} reviewed events used this quarter.",
  "unlimited": "unlimited",
  "submitted": "Submitted. WTIA reviews member events within three working days.",
  "draftSaved": "Draft saved.",
  "rejectedWith": "Returned by WTIA: {reason}",
  "saveDraft": "Save draft",
  "submit": "Submit for review",
  "saving": "Saving…",
  "edit": "Edit",
  "status": {"draft": "Draft", "pending_review": "Awaiting review", "published": "Published", "rejected": "Returned", "cancelled": "Cancelled"},
  "fields": {
    "slug": "URL slug", "titleEn": "Title (English)", "titleZh": "Title (Chinese)", "descriptionEn": "Description (English)", "descriptionZh": "Description (Chinese)",
    "startsAt": "Starts (Hong Kong time)", "endsAt": "Ends (optional)", "venue": "Venue", "capacity": "Capacity (optional)", "format": "Format",
    "onlineUrl": "Online link (online and hybrid)", "visibility": "Who can see it", "registrationMode": "Registration", "externalRegistrationUrl": "External registration link",
    "tags": "Tags (comma separated)", "heroMediaId": "Hero image id", "heroHelp": "Upload an image below to get an id, or leave blank for the default photo."
  },
  "formats": {"in_person": "In person", "online": "Online", "hybrid": "Hybrid"},
  "visibilities": {"public": "Public", "members_only": "Members only"},
  "registrationModes": {"rsvp": "RSVP on this site", "external": "External registration link"},
  "errors": {
    "INVALID": "Check the required fields, dates and links, then try again.",
    "EVENT_SLUG_TAKEN": "That URL slug is already used by another event.",
    "EVENT_QUOTA_EXCEEDED": "Your plan's quota of reviewed events for this quarter is used up. Save as draft or upgrade.",
    "EVENT_PUBLISHING_NOT_INCLUDED": "Community membership does not include event publishing.",
    "NO_MANAGED_COMPANY": "Event publishing needs a company you manage.",
    "FORBIDDEN": "You can only edit events your organisation submitted."
  }
}
```

`messages/zh-HK.json` → inside `"Portal"` add:

```json
"memberEvents": {
  "eyebrow": "貴機構的活動",
  "newTitle": "提交活動",
  "newAction": "提交活動",
  "listTitle": "貴機構已提交的活動",
  "noCompany": "發布活動需要你管理的公司。請公司擁有人將你設為管理員。",
  "quota": "本季已使用 {used} / {limit} 個經審核活動。",
  "unlimited": "不限",
  "submitted": "已提交。WTIA 會於三個工作天內審核會員活動。",
  "draftSaved": "草稿已儲存。",
  "rejectedWith": "WTIA 已退回：{reason}",
  "saveDraft": "儲存草稿",
  "submit": "提交審核",
  "saving": "儲存中…",
  "edit": "編輯",
  "status": {"draft": "草稿", "pending_review": "等待審核", "published": "已發布", "rejected": "已退回", "cancelled": "已取消"},
  "fields": {
    "slug": "網址代稱", "titleEn": "標題（英文）", "titleZh": "標題（中文）", "descriptionEn": "簡介（英文）", "descriptionZh": "簡介（中文）",
    "startsAt": "開始（香港時間）", "endsAt": "結束（選填）", "venue": "地點", "capacity": "名額（選填）", "format": "形式",
    "onlineUrl": "網上連結（網上及混合形式）", "visibility": "可見範圍", "registrationMode": "報名方式", "externalRegistrationUrl": "外部報名連結",
    "tags": "標籤（以逗號分隔）", "heroMediaId": "主圖片編號", "heroHelp": "於下方上載圖片以取得編號，或留空以使用預設相片。"
  },
  "formats": {"in_person": "實體", "online": "網上", "hybrid": "混合"},
  "visibilities": {"public": "公開", "members_only": "只限會員"},
  "registrationModes": {"rsvp": "於本網站報名", "external": "外部報名連結"},
  "errors": {
    "INVALID": "請檢查必填欄位、日期及連結，然後再試。",
    "EVENT_SLUG_TAKEN": "此網址代稱已被另一活動使用。",
    "EVENT_QUOTA_EXCEEDED": "貴計劃本季的經審核活動名額已用完。請儲存為草稿或升級計劃。",
    "EVENT_PUBLISHING_NOT_INCLUDED": "社群會籍不包括發布活動。",
    "NO_MANAGED_COMPANY": "發布活動需要你管理的公司。",
    "FORBIDDEN": "你只可編輯貴機構提交的活動。"
  }
}
```

- [ ] **Step 7: Run tests, audit, typecheck, lint**

Run: `npx vitest run tests/unit/member-event-contract.test.ts tests/unit/member-event-core.test.ts tests/unit/server-action-actor-boundary.test.ts tests/unit/locale-href-boundary.test.ts tests/unit/portal-nav.test.tsx --reporter=dot && npm run audit:strings && npm run typecheck && npx eslint lib/events components/portal/event-form.tsx "app/[locale]/(member)/portal/events"`
Expected: PASS. The `labels.ts` helper is not a route file (Next ignores non-convention files in route folders).

- [ ] **Step 8: Commit**

```bash
git add lib/events/member-contract.ts lib/events/member-core.ts lib/events/member-actions.ts components/portal/event-form.tsx "app/[locale]/(member)/portal/events" messages tests/unit/member-event-contract.test.ts tests/unit/member-event-core.test.ts
git commit -m "feat(portal): members draft and submit events for review (B-2)"
```

---

### Task 4: Member-scoped hero upload (B-2, S-3)

**Files:**
- Modify: `lib/db/repos/media.ts` (add `persistMemberUploadedMedia`, `getMediaOwnedByProfile`)
- Create: `lib/portal/media-upload.ts`, `app/api/portal/media/upload/route.ts`, `components/portal/hero-upload.tsx`
- Modify: `lib/db/repos/events.ts` (`upsertMemberEvent` verifies hero ownership), `components/portal/event-form.tsx` (render `HeroUpload`), `config/wisetech-protected-route-inventory.ts`, `tests/unit/wisetech-protected-route-ownership.test.ts`
- Test: `tests/unit/member-media-upload.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/member-media-upload.test.ts
import {describe, expect, it, vi} from "vitest";

import {createMemberMediaUploadPost, uploadMemberMedia} from "@/lib/portal/media-upload";

const member = {kind: "member" as const, userId: "u", profileId: "member-1"};
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("member media upload (programme B-2, S-3)", () => {
  it("refuses anonymous and admin-only paths, then persists with the member as registrant", async () => {
    const persist = vi.fn(async (_actor: unknown, input: {id: string}) => ({id: input.id, url: `/api/media/${input.id}`}));
    const dependencies = {
      normalize: vi.fn(async () => ({bytes: png, contentType: "image/png" as const, width: 10, height: 10, sha256: "a".repeat(64), objectKey: "media/2026/09/x.png"})),
      storage: {put: vi.fn(async () => ({etag: "\"e\""})), delete: vi.fn(async () => undefined)},
      persist,
      uuid: () => "33333333-3333-4333-8333-333333333333",
    };
    await expect(uploadMemberMedia({kind: "anonymous", userId: null}, {bytes: png, contentType: "image/png", fields: {filename: "x.png", altEn: "x", altZh: "x", focalX: 50, focalY: 50}}, dependencies as never)).rejects.toThrow("FORBIDDEN");
    expect(persist).not.toHaveBeenCalled();
    const result = await uploadMemberMedia(member, {bytes: png, contentType: "image/png", fields: {filename: "x.png", altEn: "x", altZh: "x", focalX: 50, focalY: 50}}, dependencies as never);
    expect(result).toEqual({id: "33333333-3333-4333-8333-333333333333", url: "/api/media/33333333-3333-4333-8333-333333333333"});
    expect(persist).toHaveBeenCalledWith(member, expect.objectContaining({id: "33333333-3333-4333-8333-333333333333"}));
  });

  it("returns 404 for a visitor and 201 for a member through the route", async () => {
    const post = createMemberMediaUploadPost({
      actor: async () => { throw new Error("UNAUTHORIZED"); },
      expectedOrigin: () => "https://hkwtia.example",
      upload: async () => ({id: "x", url: "/api/media/x"}),
    });
    const response = await post(new Request("https://hkwtia.example/api/portal/media/upload?filename=a.png&altEn=a&altZh=a&focalX=50&focalY=50", {method: "POST", body: png, headers: {"content-type": "image/png", "content-length": String(png.byteLength), origin: "https://hkwtia.example"}}));
    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/member-media-upload.test.ts --reporter=dot`
Expected: FAIL — module not found.

- [ ] **Step 3: Add the member persist path to the media repository**

In `lib/db/repos/media.ts`, next to `persistUploadedMedia` (which starts with `requireAdmin(actor)`), add a sibling that shares its body but requires a member and stamps the member:

```ts
/**
 * S-3: members upload event heroes through /api/portal/media/upload. Same
 * validators and audit row as the admin path; the only differences are the
 * actor gate and that `registered_by_profile_id` is the member. Ownership is
 * what later lets the member attach the row to their own event.
 */
export async function persistMemberUploadedMedia(actor: Actor, input: unknown): Promise<MediaRow> {
  requireMember(actor);
  const parsed = uploadedMediaInputSchema.parse(input);
  const database = await getDb();
  return database.transaction(async (transaction) => {
    const [row] = await transaction.insert(media).values({...parsed, registeredByProfileId: actor.profileId}).returning();
    await insertAudit(transaction, {
      actorUserId: actor.profileId, actorType: actor.kind, action: "media.uploaded", targetType: "media", targetId: row.id,
      metadata: {storageKey: parsed.storageKey, contentType: parsed.contentType, byteSize: parsed.byteSize, checksumSha256: parsed.checksumSha256, scope: "portal"},
    });
    return row;
  });
}

/** Active media the member uploaded; null otherwise. Used by the event form to accept a hero id. */
export async function getMediaOwnedByProfile(actor: Actor, mediaId: string): Promise<MediaRow | null> {
  requireMember(actor);
  const id = z.string().uuid().parse(mediaId);
  const database = await getDb();
  const rows = await database.select().from(media)
    .where(and(eq(media.id, id), eq(media.registeredByProfileId, actor.profileId), isNull(media.archivedAt))).limit(1);
  return rows[0] ?? null;
}
```

Match the file's existing names for the insert helper and `insertAudit` (read `persistUploadedMedia` first and copy its exact statements; the only change is the actor gate and the metadata `scope`). Export both through `mediaRepository` as `persistMemberUploaded` and `getOwnedByProfile`.

In `lib/db/repos/events.ts` `upsertMemberEvent`, before the insert: when `parsed.heroMediaId` is set, run `SELECT id FROM ${media} WHERE id = ${parsed.heroMediaId} AND registered_by_profile_id = ${actor.profileId} AND archived_at IS NULL` through the same `database.execute`; if no row, throw `new Error("EVENT_HERO_MEDIA_INVALID")`. Add a case to `tests/unit/member-event-repository.test.ts` that a hero id returning no row rejects with `EVENT_HERO_MEDIA_INVALID` and add the `EVENT_HERO_MEDIA_INVALID` error string to both bundles' `Portal.memberEvents.errors` ("That image id is not one you uploaded." / "此圖片編號並非你上載的圖片。").

- [ ] **Step 4: Write the member upload service and route**

```ts
// lib/portal/media-upload.ts
import "server-only";

import {uploadMedia, type MediaUploadServiceDependencies, type MediaUploadServiceInput} from "@/lib/admin/media-upload-service";
import {createMediaUploadPost} from "@/lib/admin/media-upload-route";
import {mediaRepository} from "@/lib/db/repos/media";
import type {Actor} from "@/lib/membership/lifecycle";
import {requireMember} from "@/lib/membership/lifecycle";

/**
 * The admin service already normalises, stores and persists in the right
 * order; it only differs from the member path by its actor gate and persist
 * function. `uploadMedia` gates with requireAdmin, so this wrapper gates with
 * requireMember first and then hands the admin service a persist function
 * that stamps the member — the storage and normalisation steps are shared.
 */
export async function uploadMemberMedia(actor: Actor, input: MediaUploadServiceInput, dependencies?: Partial<MediaUploadServiceDependencies>) {
  requireMember(actor);
  const memberActor = actor;
  return uploadMedia({kind: "staff", userId: memberActor.userId, profileId: memberActor.profileId}, input, {
    ...dependencies,
    persist: dependencies?.persist ?? (async (_ignored, row) => mediaRepository.persistMemberUploaded(memberActor, row)),
  });
}

export function createMemberMediaUploadPost(options: Readonly<{
  actor: () => Promise<Actor>;
  expectedOrigin: () => string;
  upload: (actor: Actor, input: MediaUploadServiceInput) => Promise<Readonly<{id: string; url: string}>>;
}>) {
  return createMediaUploadPost(options);
}
```

Read `lib/admin/media-upload-service.ts` before writing this: if `uploadMedia`'s `requireAdmin` cannot be satisfied by the staff-shaped actor above without also touching `persist`'s actor argument, split `uploadMedia` into `runMediaUploadPipeline(input, dependencies)` (no actor) called by both the admin `uploadMedia` and this member function; that refactor is the preferred shape and keeps the admin tests green. Whichever shape lands, the member persist must receive the **member** actor, never the staff-shaped one.

```ts
// app/api/portal/media/upload/route.ts
import {appEnv} from "@/lib/config/env";
import {createMemberMediaUploadPost, uploadMemberMedia} from "@/lib/portal/media-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createMemberMediaUploadPost({
  actor: async () => { const {requireActor} = await import("@/lib/auth/actor"); return requireActor(); },
  expectedOrigin: () => appEnv().appUrl,
  upload: uploadMemberMedia,
});
```

`createMediaUploadPost` already returns 404 when the actor resolver throws, checks `Origin`, reads the bounded raw body and the `filename`/`altEn`/`altZh`/`focalX`/`focalY` query params, and answers `201 {id, url}`.

- [ ] **Step 5: Upload widget in the form**

```tsx
// components/portal/hero-upload.tsx
"use client";

import {useState} from "react";

export function HeroUpload({labels, onUploaded}: Readonly<{labels: Readonly<{choose: string; upload: string; uploading: string; done: string; failed: string; alt: string}>; onUploaded: (id: string) => void}>) {
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [state, setState] = useState<"idle" | "uploading" | "done" | "failed">("idle");
  async function upload() {
    if (!file || !alt.trim()) return;
    setState("uploading");
    const query = new URLSearchParams({filename: file.name, altEn: alt.trim(), altZh: alt.trim(), focalX: "50", focalY: "50"});
    const response = await fetch(`/api/portal/media/upload?${query.toString()}`, {method: "POST", body: file, headers: {"content-type": file.type}});
    if (!response.ok) { setState("failed"); return; }
    const body = (await response.json()) as {id: string};
    onUploaded(body.id);
    setState("done");
  }
  return (
    <div className="space-y-2 rounded-md border border-border p-4 text-sm sm:col-span-2">
      <label className="block font-medium"><span>{labels.choose}</span><input accept="image/png,image/jpeg,image/webp" className="mt-2 block" onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file" /></label>
      <label className="block font-medium"><span>{labels.alt}</span><input className="mt-2 min-h-11 w-full rounded-md border border-input bg-background px-3" onChange={(event) => setAlt(event.target.value)} type="text" value={alt} /></label>
      <button className="inline-flex min-h-11 items-center rounded-md border border-border px-4 font-medium" disabled={state === "uploading" || !file || !alt.trim()} onClick={upload} type="button">{state === "uploading" ? labels.uploading : labels.upload}</button>
      <p aria-live="polite">{state === "done" ? labels.done : state === "failed" ? labels.failed : ""}</p>
    </div>
  );
}
```

In `components/portal/event-form.tsx`, hold `heroMediaId` in `useState(values?.heroMediaId ?? "")`, render the hero input as controlled (`value={heroMediaId}` with `onChange`), and render `<HeroUpload labels={labels.hero} onUploaded={setHeroMediaId} />` beneath it; extend `EventFormLabels` with `hero: {choose, upload, uploading, done, failed, alt}` and `eventFormLabels` with `hero: {choose: t("hero.choose"), upload: t("hero.upload"), uploading: t("hero.uploading"), done: t("hero.done"), failed: t("hero.failed"), alt: t("hero.alt")}`. Strings — en: `"hero": {"choose": "Choose a hero image (PNG, JPEG or WebP, up to 4 MB)", "upload": "Upload", "uploading": "Uploading…", "done": "Uploaded — the id has been filled in above.", "failed": "Upload failed. Check the file type and size.", "alt": "Describe the image"}`; zh-HK: `"hero": {"choose": "選擇主圖片（PNG、JPEG 或 WebP，最大 4 MB）", "upload": "上載", "uploading": "上載中…", "done": "已上載 — 編號已填入上方。", "failed": "上載失敗。請檢查檔案類型及大小。", "alt": "描述此圖片"}`.

- [ ] **Step 6: Register the route and re-pin the inventory**

`config/wisetech-protected-route-inventory.ts`: after `api-admin-media-upload` add `owner({id: "api-portal-media-upload", family: "api", classification: "api-handler", routePath: "/api/portal/media/upload", filePath: "app/api/portal/media/upload/route.ts", dataOwner: "Member hero-image upload (Phase B1, S-3)."})`. In `tests/unit/wisetech-protected-route-ownership.test.ts` raise the two `toHaveLength(48)` to `49`, `count("api-handler")` from `8` to `9`, and family `api` from `19` to `20`.

- [ ] **Step 7: Run tests, audit, typecheck, lint**

Run: `npx vitest run tests/unit/member-media-upload.test.ts tests/unit/media-upload-service.test.ts tests/unit/media-upload-delivery-routes.test.ts tests/unit/admin-media.test.ts tests/unit/member-event-repository.test.ts tests/unit/wisetech-protected-route-ownership.test.ts tests/unit/wisetech-route-parity.test.ts --reporter=dot && npm run audit:strings && npm run typecheck && npx eslint lib/portal/media-upload.ts lib/db/repos/media.ts app/api/portal components/portal`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/db/repos/media.ts lib/db/repos/events.ts lib/portal/media-upload.ts app/api/portal/media/upload/route.ts components/portal/hero-upload.tsx components/portal/event-form.tsx "app/[locale]/(member)/portal/events/labels.ts" config/wisetech-protected-route-inventory.ts messages tests/unit/member-media-upload.test.ts tests/unit/member-event-repository.test.ts tests/unit/wisetech-protected-route-ownership.test.ts
git commit -m "feat(portal): member-scoped hero image upload for submitted events (B-2, S-3)"
```

---

### Task 5: Admin review queue for member events (B-3, D-8)

**Files:**
- Create: `lib/admin/event-review-core.ts`, `lib/admin/event-review-actions.ts`, `components/admin/event-review-table.tsx`
- Modify: `app/[locale]/(admin)/admin/events-mgmt/page.tsx` (review section above the form), `messages/*` (`Admin.eventsMgmt.review`)
- Test: `tests/unit/event-review-core.test.ts`, extend `tests/unit/server-action-actor-boundary.test.ts` known-file list

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/event-review-core.test.ts
import {describe, expect, it, vi} from "vitest";

import {approveMemberEvent, rejectMemberEvent} from "@/lib/admin/event-review-core";

const EVENT = "22222222-2222-4222-8222-222222222222";
const staff = {kind: "staff" as const, userId: "s", profileId: "staff-1"};
const member = {kind: "member" as const, userId: "u", profileId: "m"};

describe("event review core (programme B-3)", () => {
  it("requires an admin and a uuid, then delegates the decision", async () => {
    const review = vi.fn(async () => ({id: EVENT, status: "published"}));
    await expect(approveMemberEvent(member, EVENT, {review})).rejects.toThrow();
    await expect(approveMemberEvent(staff, "nope", {review})).rejects.toThrow();
    await expect(approveMemberEvent(staff, EVENT, {review})).resolves.toMatchObject({status: "published"});
    expect(review).toHaveBeenCalledWith(staff, EVENT, {decision: "approve"});
    await rejectMemberEvent(staff, EVENT, " duplicate ", {review});
    expect(review).toHaveBeenLastCalledWith(staff, EVENT, {decision: "reject", reason: "duplicate"});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/event-review-core.test.ts --reporter=dot`
Expected: FAIL — module not found.

- [ ] **Step 3: Core, actions, table, page**

```ts
// lib/admin/event-review-core.ts
import "server-only";

import {z} from "zod";

import {requireAdmin} from "@/lib/auth/authorize";
import {eventsRepository} from "@/lib/db/repos/events";
import type {Actor} from "@/lib/membership/lifecycle";

type Reviewer = Pick<typeof eventsRepository, "review">;

export async function approveMemberEvent(actor: Actor, eventId: unknown, deps: Reviewer = eventsRepository) {
  requireAdmin(actor);
  return deps.review(actor, z.string().uuid().parse(eventId), {decision: "approve"});
}

export async function rejectMemberEvent(actor: Actor, eventId: unknown, reason: unknown, deps: Reviewer = eventsRepository) {
  requireAdmin(actor);
  return deps.review(actor, z.string().uuid().parse(eventId), {decision: "reject", reason: z.string().trim().min(1).max(1_000).parse(reason)});
}
```

```ts
// lib/admin/event-review-actions.ts
"use server";

import {revalidatePath} from "next/cache";

import {approveMemberEvent, rejectMemberEvent} from "@/lib/admin/event-review-core";
import {revalidateAdminPath} from "@/lib/admin/revalidate-path";

async function afterReview(path: string): Promise<void> {
  revalidateAdminPath(path);
  revalidatePath("/en/events");
  revalidatePath("/zh-HK/events");
}

export async function approveMemberEventAction(path: string, formData: FormData): Promise<void> {
  const {requireAdminActor} = await import("@/lib/auth/actor");
  const actor = await requireAdminActor();
  await approveMemberEvent(actor, formData.get("eventId"));
  await afterReview(path);
}

export async function rejectMemberEventAction(path: string, formData: FormData): Promise<void> {
  const {requireAdminActor} = await import("@/lib/auth/actor");
  const actor = await requireAdminActor();
  await rejectMemberEvent(actor, formData.get("eventId"), formData.get("rejectionReason"));
  await afterReview(path);
}
```

```tsx
// components/admin/event-review-table.tsx
import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

export type ReviewRow = Readonly<{id: string; slug: string; titleEn: string; startsAt: Date; organiser: string | null; submittedAt: Date | null; format: string; visibility: string}>;
type Action = (formData: FormData) => void | Promise<void>;
type Labels = Readonly<{caption: string; title: string; organiser: string; starts: string; submitted: string; format: string; visibility: string; approve: string; reject: string; rejectionReason: string; preview: string; empty: string}>;

export function EventReviewTable({rows, labels, locale, approveAction, rejectAction}: Readonly<{rows: readonly ReviewRow[]; labels: Labels; locale: AppLocale; approveAction: Action; rejectAction: Action}>) {
  const formatter = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Hong_Kong"});
  if (rows.length === 0) return <p className="text-muted-foreground">{labels.empty}</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm"><caption className="sr-only">{labels.caption}</caption>
        <thead><tr className="text-left"><th className="p-3">{labels.title}</th><th className="p-3">{labels.organiser}</th><th className="p-3">{labels.starts}</th><th className="p-3">{labels.submitted}</th><th className="p-3">{labels.format}</th><th className="p-3">{labels.visibility}</th><th className="p-3">{labels.approve}</th><th className="p-3">{labels.reject}</th></tr></thead>
        <tbody>{rows.map((row) => (
          <tr className="border-t border-border" key={row.id}>
            <td className="p-3"><Link className="text-primary underline" href={localizedPath(locale, `/admin/events-mgmt/${row.id}`)}>{row.titleEn}</Link></td>
            <td className="p-3">{row.organiser ?? ""}</td>
            <td className="p-3">{formatter.format(row.startsAt)}</td>
            <td className="p-3">{row.submittedAt ? formatter.format(row.submittedAt) : ""}</td>
            <td className="p-3">{row.format}</td><td className="p-3">{row.visibility}</td>
            <td className="p-3"><form action={approveAction}><input name="eventId" type="hidden" value={row.id} /><button className="rounded-md bg-primary px-3 py-1 text-primary-foreground" type="submit">{labels.approve}</button></form></td>
            <td className="p-3"><form action={rejectAction} className="flex gap-2"><input name="eventId" type="hidden" value={row.id} /><input aria-label={labels.rejectionReason} className="min-h-9 rounded-md border border-input px-2" name="rejectionReason" required /><button className="rounded-md border border-border px-3 py-1" type="submit">{labels.reject}</button></form></td>
          </tr>))}</tbody>
      </table>
    </div>
  );
}
```

In `app/[locale]/(admin)/admin/events-mgmt/page.tsx`: keep `requireAdminPageActor()` first; add `eventsRepository.listForReview(actor).catch(() => [])` to the existing `Promise.all`; map rows to `ReviewRow` (`id`, `slug`, `titleEn: String(row.title_en ?? row.titleEn)`, `startsAt: new Date(String(row.starts_at ?? row.startsAt))`, `organiser: organiserName`, `submittedAt`, `format`, `visibility`). For the organiser name run `companiesRepository.getById` is member-scoped, so instead extend `listEventsForReview` (Task 2) to `LEFT JOIN companies c ON c.id = events.organiser_company_id` and select `c.display_name AS organiser_name`; read `row.organiser_name`. Render `<EventReviewTable … approveAction={approveMemberEventAction.bind(null, path)} rejectAction={rejectMemberEventAction.bind(null, path)} />` under a `<h2>{t("review.title")}</h2>` above the create form, with `path = \`/${locale}/admin/events-mgmt\`` exactly as `listings-review/page.tsx` does.

Strings — `Admin.eventsMgmt.review` en: `{"title": "Member events awaiting review", "caption": "Events submitted by member organisations", "event": "Event", "organiser": "Organiser", "starts": "Starts", "submitted": "Submitted", "format": "Format", "visibility": "Visibility", "approve": "Approve and publish", "reject": "Return", "rejectionReason": "Reason for returning", "preview": "Open", "empty": "No member events are waiting for review."}`; zh-HK: `{"title": "等待審核的會員活動", "caption": "會員機構提交的活動", "event": "活動", "organiser": "主辦機構", "starts": "開始", "submitted": "提交時間", "format": "形式", "visibility": "可見範圍", "approve": "批准並發布", "reject": "退回", "rejectionReason": "退回原因", "preview": "開啟", "empty": "目前沒有等待審核的會員活動。"}`.

- [ ] **Step 4: Run tests, audit, typecheck, lint**

Run: `npx vitest run tests/unit/event-review-core.test.ts tests/unit/server-action-actor-boundary.test.ts tests/unit/admin-page-auth-source.test.ts tests/unit/admin-events.test.ts --reporter=dot && npm run audit:strings && npm run typecheck && npx eslint lib/admin/event-review-core.ts lib/admin/event-review-actions.ts components/admin/event-review-table.tsx "app/[locale]/(admin)/admin/events-mgmt/page.tsx"`
Expected: PASS. Add `lib/admin/event-review-actions.ts` to the boundary test's known `"use server"` file list.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/event-review-core.ts lib/admin/event-review-actions.ts components/admin/event-review-table.tsx "app/[locale]/(admin)/admin/events-mgmt/page.tsx" lib/db/repos/events.ts messages tests/unit/event-review-core.test.ts tests/unit/server-action-actor-boundary.test.ts
git commit -m "feat(admin): review queue approves or returns member-submitted events with audit rows (B-3, D-8)"
```

---

### Task 6: Guest RSVP with confirmation email and cancel link (B-4)

**Files:**
- Create: `lib/db/repos/event-guests.ts`, `lib/events/guest-registration-core.ts`, `lib/events/guest-registration-action.ts`, `components/marketing/guest-rsvp-form.tsx`, `app/api/events/guest/cancel/route.ts`
- Modify: `lib/db/repos/index.ts`, `lib/email/catalog.ts` (`event_guest_confirmation`), `messages/*` (`Email.templates.event_guest_confirmation`, `Events.guest`), `app/[locale]/(public)/events/[slug]/page.tsx` (anonymous branch), `config/wisetech-protected-route-inventory.ts` + ownership pins (api count +1)
- Test: `tests/unit/event-guests-repository.test.ts`, `tests/unit/guest-registration-service.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/event-guests-repository.test.ts
import {describe, expect, it, vi} from "vitest";

import {contactWriterActor} from "@/lib/db/repos/contacts";
import {createEventGuestsRepository} from "@/lib/db/repos/event-guests";

const EVENT = "22222222-2222-4222-8222-222222222222";
function database(rows: Record<string, unknown>[][]) {
  const queue = [...rows];
  const execute = vi.fn(async () => queue.shift() ?? []);
  return {execute, db: {execute, transaction: async <T,>(work: (tx: {execute: typeof execute}) => Promise<T>) => work({execute})}};
}

describe("eventGuestsRepository (programme B-4)", () => {
  it("refuses any actor without the event_guest capability", async () => {
    const {execute, db} = database([]);
    const repository = createEventGuestsRepository(async () => db as never);
    await expect(repository.register({kind: "anonymous", userId: null}, {eventId: EVENT, name: "A", email: "a@b.hk", locale: "en", whatsappNumber: null, organisation: null, marketingConsent: false, idempotencyKey: "k", cancelTokenDigest: "d".repeat(64)})).rejects.toThrow("FORBIDDEN");
    expect(execute).not.toHaveBeenCalled();
  });

  it("registers inside capacity, waitlists beyond it, and replays an idempotency key", async () => {
    const {execute, db} = database([[{id: EVENT, status: "published", visibility: "public", registration_mode: "rsvp", capacity: 1, starts_at: "2030-01-01T00:00:00Z", ends_at: null}], [{count: 0}], [{id: "g1", status: "registered"}]]);
    const repository = createEventGuestsRepository(async () => db as never);
    const result = await repository.register(contactWriterActor("event_guest"), {eventId: EVENT, name: "A", email: "A@B.hk", locale: "en", whatsappNumber: null, organisation: null, marketingConsent: false, idempotencyKey: "k1", cancelTokenDigest: "d".repeat(64)});
    expect(result).toEqual({id: "g1", disposition: "registered"});
    expect(execute).toHaveBeenCalledTimes(3);
    const full = database([[{id: EVENT, status: "published", visibility: "public", registration_mode: "rsvp", capacity: 1, starts_at: "2030-01-01T00:00:00Z", ends_at: null}], [{count: 1}], [{id: "g2", status: "waitlist"}]]);
    await expect(createEventGuestsRepository(async () => full.db as never).register(contactWriterActor("event_guest"), {eventId: EVENT, name: "B", email: "b@b.hk", locale: "en", whatsappNumber: null, organisation: null, marketingConsent: false, idempotencyKey: "k2", cancelTokenDigest: "e".repeat(64)})).resolves.toEqual({id: "g2", disposition: "waitlist"});
  });

  it("refuses closed, unpublished or external-registration events before writing", async () => {
    const {execute, db} = database([[{id: EVENT, status: "published", visibility: "public", registration_mode: "external", capacity: null, starts_at: "2030-01-01T00:00:00Z", ends_at: null}]]);
    await expect(createEventGuestsRepository(async () => db as never).register(contactWriterActor("event_guest"), {eventId: EVENT, name: "A", email: "a@b.hk", locale: "en", whatsappNumber: null, organisation: null, marketingConsent: false, idempotencyKey: "k3", cancelTokenDigest: "f".repeat(64)})).rejects.toThrow("EVENT_REGISTRATION_EXTERNAL");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("cancels by token digest and reports unknown tokens", async () => {
    const {db} = database([[{id: "g1"}]]);
    await expect(createEventGuestsRepository(async () => db as never).cancelByToken(contactWriterActor("event_guest"), "d".repeat(64))).resolves.toBe("cancelled");
    const miss = database([[]]);
    await expect(createEventGuestsRepository(async () => miss.db as never).cancelByToken(contactWriterActor("event_guest"), "d".repeat(64))).resolves.toBe("unknown");
  });
});
```

```ts
// tests/unit/guest-registration-service.test.ts
import {describe, expect, it, vi} from "vitest";

import {createGuestRegistrationService} from "@/lib/events/guest-registration-core";
import {createInMemoryRateLimiter} from "@/lib/security/rate-limit";

const EVENT = "22222222-2222-4222-8222-222222222222";
function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set("eventId", EVENT); data.set("slug", "ai-clinic"); data.set("name", "Ada"); data.set("email", "ADA@example.hk"); data.set("locale", "en");
  data.set("whatsappNumber", "+852 9123 4567"); data.set("organisation", "Acme"); data.set("marketingConsent", "on");
  for (const [key, value] of Object.entries(overrides)) data.set(key, value);
  return data;
}
function service() {
  const register = vi.fn(async () => ({id: "g1", disposition: "registered" as const}));
  const upsertContact = vi.fn(async () => ({id: "c1", disposition: "upserted" as const}));
  const send = vi.fn(async () => undefined);
  const subject = createGuestRegistrationService({
    guests: {register}, contacts: {upsertFromInterestForm: upsertContact},
    limiter: createInMemoryRateLimiter({limit: 1, windowMs: 60_000, now: () => 1}),
    resolveClientIp: async () => "203.0.113.9", sendConfirmation: send,
    secret: "s".repeat(32), appUrl: "https://hkwtia.example", now: () => new Date("2026-09-09T00:00:00Z"),
  });
  return {subject, register, upsertContact, send};
}

describe("guest registration service (programme B-4)", () => {
  it("honeypot short-circuits; valid input registers, upserts a contact and sends one confirmation", async () => {
    const {subject, register, upsertContact, send} = service();
    await expect(subject.submit(form({website: "spam"}))).resolves.toEqual({ok: true, disposition: "registered"});
    expect(register).not.toHaveBeenCalled();
    await expect(subject.submit(form())).resolves.toEqual({ok: true, disposition: "registered"});
    expect(register).toHaveBeenCalledWith(expect.objectContaining({kind: "contact-writer", source: "event_guest"}), expect.objectContaining({eventId: EVENT, email: "ada@example.hk", whatsappNumber: "+85291234567", marketingConsent: true}));
    expect(upsertContact).toHaveBeenCalledWith(expect.objectContaining({source: "event_guest"}), expect.objectContaining({email: "ada@example.hk", whatsappOptIn: true}));
    expect(send).toHaveBeenCalledTimes(1);
    const [payload] = send.mock.calls[0] as unknown as [{cancelUrl: string}];
    expect(payload.cancelUrl).toMatch(/^https:\/\/hkwtia\.example\/api\/events\/guest\/cancel\?token=/);
  });

  it("rejects invalid input and rate-limits the client", async () => {
    const {subject} = service();
    await expect(subject.submit(form({email: "nope"}))).resolves.toEqual({ok: false, code: "invalid"});
    await subject.submit(form());
    await expect(subject.submit(form({email: "other@example.hk"}))).resolves.toEqual({ok: false, code: "rate_limited"});
  });

  it("maps repository refusals to codes", async () => {
    const {subject, register} = service();
    register.mockRejectedValueOnce(new Error("EVENT_REGISTRATION_CLOSED"));
    await expect(subject.submit(form())).resolves.toEqual({ok: false, code: "closed"});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/event-guests-repository.test.ts tests/unit/guest-registration-service.test.ts --reporter=dot`
Expected: FAIL — modules not found.

- [ ] **Step 3: Repository**

```ts
// lib/db/repos/event-guests.ts
import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {contactWriterActor, type ContactWriterActor} from "@/lib/db/repos/contacts";
import {getDb} from "@/lib/db/repos/common";
import type {AutomationDatabase, AutomationDatabaseLoader} from "@/lib/db/repos/journeys";
import {eventGuestRegistrations, events} from "@/lib/db/server-schema";

const guestInputSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  locale: z.enum(["en", "zh-HK"]),
  whatsappNumber: z.string().regex(/^\+\d{8,15}$/).nullable(),
  organisation: z.string().trim().max(200).nullable(),
  marketingConsent: z.boolean(),
  idempotencyKey: z.string().min(8).max(200),
  cancelTokenDigest: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export type GuestRegistrationInput = z.input<typeof guestInputSchema>;
export type GuestRegistrationResult = Readonly<{id: string; disposition: "registered" | "waitlist" | "already_registered"}>;

function requireGuestWriter(actor: unknown): asserts actor is ContactWriterActor {
  const probe = contactWriterActor("event_guest");
  const symbols = Object.getOwnPropertySymbols(probe);
  const candidate = actor as Record<string | symbol, unknown> | null;
  if (!candidate || candidate.kind !== "contact-writer" || candidate.source !== "event_guest" || !symbols.every((symbol) => candidate[symbol] === true)) throw new Error("FORBIDDEN");
}

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows as Record<string, unknown>[];
  return [];
}

async function defaultDatabaseLoader(): Promise<AutomationDatabase> { return await getDb() as unknown as AutomationDatabase; }

export function createEventGuestsRepository(loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader, now: () => Date = () => new Date()) {
  return {
    /** Capability-gated public write. Order: event gate → capacity → upsert, all in one transaction. */
    async register(actor: unknown, input: unknown): Promise<GuestRegistrationResult> {
      requireGuestWriter(actor);
      const parsed = guestInputSchema.parse(input);
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        const event = rowsFrom(await transaction.execute(sql`
          SELECT id, status, visibility, registration_mode, capacity, starts_at, ends_at FROM ${events} WHERE ${events.id} = ${parsed.eventId} FOR UPDATE
        `))[0];
        if (!event || event.status !== "published" || event.visibility !== "public") throw new Error("EVENT_NOT_FOUND");
        if (event.registration_mode === "external") throw new Error("EVENT_REGISTRATION_EXTERNAL");
        if (event.registration_mode === "ticketed") throw new Error("EVENT_REGISTRATION_TICKETED");
        const boundary = new Date(String(event.ends_at ?? event.starts_at));
        if (boundary < now()) throw new Error("EVENT_REGISTRATION_CLOSED");
        const taken = Number(rowsFrom(await transaction.execute(sql`
          SELECT (SELECT count(*) FROM event_registrations r WHERE r.event_id = ${parsed.eventId} AND r.status IN ('registered', 'attended'))
               + (SELECT count(*) FROM ${eventGuestRegistrations} g WHERE g.event_id = ${parsed.eventId} AND g.status IN ('registered', 'attended')) AS count
        `))[0]?.count ?? 0);
        const status = event.capacity !== null && event.capacity !== undefined && taken >= Number(event.capacity) ? "waitlist" : "registered";
        const row = rowsFrom(await transaction.execute(sql`
          INSERT INTO ${eventGuestRegistrations}
            (event_id, name, email, whatsapp_number, organisation, locale, status, marketing_consent_at, cancel_token_digest, idempotency_key)
          VALUES (${parsed.eventId}, ${parsed.name}, ${parsed.email}, ${parsed.whatsappNumber}, ${parsed.organisation}, ${parsed.locale}, ${status},
                  ${parsed.marketingConsent ? now() : null}, ${parsed.cancelTokenDigest}, ${parsed.idempotencyKey})
          ON CONFLICT (event_id, email) DO UPDATE SET
            name = EXCLUDED.name, updated_at = now(),
            status = CASE WHEN ${eventGuestRegistrations.status} = 'cancelled' THEN EXCLUDED.status ELSE ${eventGuestRegistrations.status} END,
            cancelled_at = CASE WHEN ${eventGuestRegistrations.status} = 'cancelled' THEN NULL ELSE ${eventGuestRegistrations.cancelledAt} END,
            cancel_token_digest = CASE WHEN ${eventGuestRegistrations.status} = 'cancelled' THEN EXCLUDED.cancel_token_digest ELSE ${eventGuestRegistrations.cancelTokenDigest} END
          RETURNING id, status, (xmax = 0) AS inserted
        `))[0];
        if (!row) throw new Error("GUEST_REGISTRATION_FAILED");
        const disposition = row.inserted === true || row.inserted === "t" ? (row.status === "waitlist" ? "waitlist" : "registered") : "already_registered";
        return {id: String(row.id), disposition};
      });
    },

    async cancelByToken(actor: unknown, cancelTokenDigest: string): Promise<"cancelled" | "unknown"> {
      requireGuestWriter(actor);
      const digest = z.string().regex(/^[0-9a-f]{64}$/).parse(cancelTokenDigest);
      const database = await loadDatabase();
      const row = rowsFrom(await database.execute(sql`
        UPDATE ${eventGuestRegistrations} SET status = 'cancelled', cancelled_at = now(), updated_at = now()
        WHERE ${eventGuestRegistrations.cancelTokenDigest} = ${digest} AND ${eventGuestRegistrations.status} <> 'cancelled'
        RETURNING id
      `))[0];
      return row ? "cancelled" : "unknown";
    },
  };
}

export type EventGuestsRepository = ReturnType<typeof createEventGuestsRepository>;
export const eventGuestsRepository = createEventGuestsRepository();
```

`requireGuestWriter` reuses the capability symbol minted in `lib/db/repos/contacts.ts`: it compares against a freshly minted `contactWriterActor("event_guest")`, so a forged object without the symbol fails. Add `export {eventGuestsRepository} from "./event-guests";` to `lib/db/repos/index.ts`. `already_registered` relies on `RETURNING (xmax = 0) AS inserted`; the unit fake returns `status` only, so treat a missing `inserted` as inserted (`row.inserted === undefined` → inserted) — write it exactly as `const inserted = row.inserted === undefined || row.inserted === true || row.inserted === "t";`.

- [ ] **Step 4: Service, action, email template, form, cancel route**

```ts
// lib/events/guest-registration-core.ts
import "server-only";

import {createHmac, randomUUID} from "node:crypto";
import {z} from "zod";

import {contactWriterActor, type ContactsRepository} from "@/lib/db/repos/contacts";
import type {EventGuestsRepository} from "@/lib/db/repos/event-guests";
import type {RateLimiter} from "@/lib/security/rate-limit";
import {normalizeWhatsAppNumber} from "@/lib/whatsapp/number";

const inputSchema = z.object({
  eventId: z.string().uuid(), slug: z.string().min(1).max(96), name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320), locale: z.enum(["en", "zh-HK"]), whatsappNumber: z.string().trim().max(32),
  organisation: z.string().trim().max(200), marketingConsent: z.boolean(), website: z.string().trim(),
});

export type GuestRsvpResult = Readonly<{ok: true; disposition: "registered" | "waitlist" | "already_registered"} | {ok: false; code: "invalid" | "rate_limited" | "closed" | "external" | "unavailable"}>;

export type GuestConfirmation = Readonly<{to: string; name: string; locale: "en" | "zh-HK"; slug: string; disposition: "registered" | "waitlist" | "already_registered"; cancelUrl: string}>;

export type GuestRegistrationDependencies = Readonly<{
  guests: Pick<EventGuestsRepository, "register">;
  contacts: Pick<ContactsRepository, "upsertFromInterestForm">;
  limiter: RateLimiter;
  resolveClientIp: () => Promise<string | null>;
  sendConfirmation: (confirmation: GuestConfirmation) => Promise<void>;
  secret: string;
  appUrl: string;
  now?: () => Date;
}>;

const text = (formData: FormData, key: string) => { const value = formData.get(key); return typeof value === "string" ? value : ""; };

/** Cancel tokens are random; only their HMAC digest is stored, so a database read cannot cancel on a guest's behalf. */
export function cancelTokenDigest(secret: string, token: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

export function createGuestRegistrationService(dependencies: GuestRegistrationDependencies) {
  return Object.freeze({
    async submit(formData: FormData): Promise<GuestRsvpResult> {
      if (text(formData, "website").trim().length > 0) return {ok: true, disposition: "registered"};
      const parsed = inputSchema.safeParse({
        eventId: text(formData, "eventId"), slug: text(formData, "slug"), name: text(formData, "name"), email: text(formData, "email"),
        locale: text(formData, "locale"), whatsappNumber: text(formData, "whatsappNumber"), organisation: text(formData, "organisation"),
        marketingConsent: formData.get("marketingConsent") === "on", website: text(formData, "website"),
      });
      if (!parsed.success) return {ok: false, code: "invalid"};
      const whatsappNumber = parsed.data.whatsappNumber ? normalizeWhatsAppNumber(parsed.data.whatsappNumber) : null;
      if (parsed.data.whatsappNumber && !whatsappNumber) return {ok: false, code: "invalid"};
      const clientIp = await dependencies.resolveClientIp();
      const key = clientIp ? `guest-rsvp:ip:${clientIp}` : `guest-rsvp:email:${parsed.data.email.toLowerCase()}`;
      if (!dependencies.limiter.check(key).allowed) return {ok: false, code: "rate_limited"};

      const token = randomUUID().replace(/-/g, "");
      const actor = contactWriterActor("event_guest");
      const email = parsed.data.email.toLowerCase();
      let result;
      try {
        result = await dependencies.guests.register(actor, {
          eventId: parsed.data.eventId, name: parsed.data.name, email, locale: parsed.data.locale, whatsappNumber,
          organisation: parsed.data.organisation || null, marketingConsent: parsed.data.marketingConsent,
          idempotencyKey: `guest:${parsed.data.eventId}:${email}`, cancelTokenDigest: cancelTokenDigest(dependencies.secret, token),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message === "EVENT_REGISTRATION_CLOSED") return {ok: false, code: "closed"};
        if (message === "EVENT_REGISTRATION_EXTERNAL" || message === "EVENT_REGISTRATION_TICKETED") return {ok: false, code: "external"};
        if (message === "EVENT_NOT_FOUND") return {ok: false, code: "unavailable"};
        throw error;
      }
      // The contact is the funnel spine (D-6); its failure must not undo a registration.
      await dependencies.contacts.upsertFromInterestForm(actor, {email, displayName: parsed.data.name, locale: parsed.data.locale, whatsappNumber, whatsappOptIn: parsed.data.marketingConsent && whatsappNumber !== null}).catch(() => undefined);
      if (result.disposition !== "already_registered") {
        await dependencies.sendConfirmation({
          to: email, name: parsed.data.name, locale: parsed.data.locale, slug: parsed.data.slug, disposition: result.disposition,
          cancelUrl: `${dependencies.appUrl}/api/events/guest/cancel?token=${token}`,
        }).catch(() => undefined);
      }
      return {ok: true, disposition: result.disposition};
    },
  });
}
```

`upsertFromInterestForm` records `whatsapp_consent_source = 'interest_form'`; extend that repository method (Task 6 of Phase A) with an optional `consentSource` field defaulting to `"interest_form"`, and pass `consentSource: "rsvp"` here — one added optional key in `interestInputSchema`, mirrored in `tests/unit/contacts-repository.test.ts`.

```ts
// lib/events/guest-registration-action.ts
"use server";

import {headers} from "next/headers";

import {appEnv, emailEnv, unsubscribeEnv} from "@/lib/config/env";
import {contactsRepository} from "@/lib/db/repos/contacts";
import {eventGuestsRepository} from "@/lib/db/repos/event-guests";
import {renderEmail} from "@/lib/email/render";
import {createConfiguredEmailTransport} from "@/lib/email/transport";
import {createGuestRegistrationService, type GuestRsvpResult} from "@/lib/events/guest-registration-core";
import {createInMemoryRateLimiter} from "@/lib/security/rate-limit";
import {clientIpFromHeaders} from "@/lib/security/request-origin";
import {localizedPath} from "@/lib/urls";

const guestRateLimiter = createInMemoryRateLimiter({limit: 5, windowMs: 15 * 60_000});

export async function submitGuestRsvpAction(formData: FormData): Promise<GuestRsvpResult> {
  const {appUrl} = appEnv();
  const email = emailEnv();
  const transport = createConfiguredEmailTransport(email);
  const service = createGuestRegistrationService({
    guests: eventGuestsRepository, contacts: contactsRepository, limiter: guestRateLimiter,
    resolveClientIp: async () => clientIpFromHeaders(await headers()),
    secret: unsubscribeEnv().unsubscribeTokenSecret, appUrl,
    async sendConfirmation(confirmation) {
      const rendered = renderEmail({
        template: "event_guest_confirmation", locale: confirmation.locale, recipientName: confirmation.name, classification: "transactional",
        variables: {ctaUrl: `${appUrl}${localizedPath(confirmation.locale, `/events/${confirmation.slug}`)}`, cancelUrl: confirmation.cancelUrl, disposition: confirmation.disposition},
      });
      await transport.send({to: confirmation.to, from: email.emailFrom, subject: rendered.subject, html: rendered.html, text: rendered.text, headers: rendered.headers, idempotencyKey: `guest-rsvp:${confirmation.slug}:${confirmation.to}`});
    },
  });
  return service.submit(formData);
}
```

Read `lib/email/transport.ts` `EmailSendInput` (L7) and pass exactly its fields. Add `"event_guest_confirmation"` to `EMAIL_TEMPLATE_IDS` in `lib/email/catalog.ts` with `DEFAULT_CLASSIFICATION` `transactional`, and copy under `Email.templates.event_guest_confirmation` in both bundles — en: `{"subject": "You're on the list: {eventTitle}", "preview": "Your RSVP is confirmed.", "heading": "See you there", "body": "Thanks for registering. If your plans change, use the cancel link so someone on the waitlist can take your place.", "cta": "View the event"}`; zh-HK: `{"subject": "已登記：{eventTitle}", "preview": "你的報名已確認。", "heading": "期待見到你", "body": "多謝報名。如計劃有變，請使用取消連結，讓候補名單上的人可以補上。", "cta": "查看活動"}`. The catalog's `EmailCopy` shape has no cancel slot: append `{cancelUrl}` to the `body` copy in both bundles and interpolate it the way the catalog interpolates `variables` (check `lib/email/catalog.ts:34-56` for the interpolation function name and reuse it). `eventTitle` is not known to the action; pass `variables.eventTitle` from the page-bound slug by adding `eventTitle` to `GuestConfirmation` and to the form as a hidden field is **not** acceptable (client-controlled). Instead have the service read the title from the guest repository: extend `register` to `RETURNING` the event title by selecting `title_en, title_zh` in the locked event row and returning `{id, disposition, eventTitle}`; forward it into `sendConfirmation`. Update the repository test's expected result to `expect.objectContaining({id: "g1", disposition: "registered"})`. Re-run `tests/unit/email-render-snapshots.test.ts` and accept the one new snapshot (`en-event_guest_confirmation 1`) after reading it.

```tsx
// components/marketing/guest-rsvp-form.tsx
"use client";

import {useActionState} from "react";

import type {AppLocale} from "@/i18n/routing";
import type {GuestRsvpResult} from "@/lib/events/guest-registration-core";

export type GuestRsvpLabels = Readonly<{name: string; email: string; organisation: string; whatsappNumber: string; marketingConsent: string; consent: string; website: string; submit: string; submitting: string; registered: string; waitlist: string; already: string; invalid: string; rateLimited: string; closed: string; external: string; unavailable: string}>;
type State = Readonly<{status: "idle" | "registered" | "waitlist" | "already_registered" | "invalid" | "rate_limited" | "closed" | "external" | "unavailable"}>;

export function GuestRsvpForm({action, eventId, slug, locale, labels}: Readonly<{action: (formData: FormData) => Promise<GuestRsvpResult>; eventId: string; slug: string; locale: AppLocale; labels: GuestRsvpLabels}>) {
  const [state, formAction, pending] = useActionState(async (_previous: State, formData: FormData): Promise<State> => {
    const result = await action(formData);
    return {status: result.ok ? result.disposition : result.code};
  }, {status: "idle"} as State);
  const message = {idle: "", registered: labels.registered, waitlist: labels.waitlist, already_registered: labels.already, invalid: labels.invalid, rate_limited: labels.rateLimited, closed: labels.closed, external: labels.external, unavailable: labels.unavailable}[state.status];
  const failed = ["invalid", "rate_limited", "closed", "external", "unavailable"].includes(state.status);
  return (
    <form action={formAction} className="partner-form guest-rsvp-form" noValidate>
      <input name="eventId" type="hidden" value={eventId} /><input name="slug" type="hidden" value={slug} /><input name="locale" type="hidden" value={locale} />
      <div className="form-grid">
        <label htmlFor="guest-name"><span>{labels.name}</span><input autoComplete="name" id="guest-name" name="name" required type="text" /></label>
        <label htmlFor="guest-email"><span>{labels.email}</span><input autoComplete="email" id="guest-email" name="email" required type="email" /></label>
        <label htmlFor="guest-organisation"><span>{labels.organisation}</span><input autoComplete="organization" id="guest-organisation" name="organisation" type="text" /></label>
        <label htmlFor="guest-whatsapp"><span>{labels.whatsappNumber}</span><input autoComplete="tel" id="guest-whatsapp" name="whatsappNumber" type="tel" /></label>
      </div>
      <label className="consent" htmlFor="guest-consent"><input id="guest-consent" name="marketingConsent" type="checkbox" /><span>{labels.marketingConsent}</span></label>
      <p className="interest-form-consent">{labels.consent}</p>
      <label className="sr-only" htmlFor="guest-website">{labels.website}<input autoComplete="off" id="guest-website" name="website" tabIndex={-1} type="text" /></label>
      <button className="button" disabled={pending} type="submit">{pending ? labels.submitting : labels.submit}</button>
      <p aria-live="polite" className={failed ? "form-error" : "interest-form-status"} id="guest-rsvp-status">{message}</p>
    </form>
  );
}
```

In `app/[locale]/(public)/events/[slug]/page.tsx`: resolve the actor with `getActor().catch(() => null)` (import from `@/lib/auth/actor` — this page is already dynamic and already imports the actor for registration); when `!past` and the visitor is anonymous and the event's `registrationMode === "rsvp"`, render `<GuestRsvpForm action={submitGuestRsvpAction} eventId={row.id} slug={row.slug} locale={appLocale} labels={…} />` in place of the member registration form; when `registrationMode === "external"` render an `<a className="button" href={externalRegistrationUrl} rel="noopener noreferrer" target="_blank">{t("detail.registerExternally")}</a>`. `PublicEventProjection` (lib/events/public.ts) must carry `registrationMode`, `externalRegistrationUrl`, `format`, `onlineUrl`, `tags`, `organiser: {name, slug} | null` — extend the projection and `listPublicEvents`' select (join `companies` on `organiser_company_id` for `display_name`; the directory slug arrives with Phase B2, so select `organiser_name` only here and leave `slug: null`). Strings `Events.guest` — en: `{"title": "Reserve a place", "name": "Name", "email": "Email address", "organisation": "Organisation (optional)", "whatsappNumber": "WhatsApp number (optional)", "marketingConsent": "Also send me WTIA activity updates (email and WhatsApp)", "consent": "WTIA uses these details to run this event and, if you tick the box, to tell you about future activities. Reply STOP on WhatsApp or use the unsubscribe link to opt out.", "website": "Leave this field empty", "submit": "Register", "submitting": "Registering…", "registered": "You're registered. A confirmation is on its way to your inbox.", "waitlist": "The event is full; you're on the waitlist and we'll email you if a place opens.", "already": "That email is already registered for this event.", "invalid": "Check your name, email and WhatsApp number, then try again.", "rateLimited": "Too many attempts from this connection. Try again in a few minutes.", "closed": "Registration for this event has closed.", "external": "This event takes registrations on the organiser's site.", "unavailable": "Registration is not available right now."}` and `Events.detail.registerExternally: "Register on the organiser's site"`; zh-HK: `{"title": "預留名額", "name": "姓名", "email": "電郵地址", "organisation": "機構（選填）", "whatsappNumber": "WhatsApp 號碼（選填）", "marketingConsent": "同時向我發送 WTIA 活動更新（電郵及 WhatsApp）", "consent": "WTIA 會使用這些資料舉辦本活動；如你剔選方格，亦會通知你日後的活動。你可於 WhatsApp 回覆「取消」或使用取消訂閱連結以停止接收。", "website": "請留空此欄", "submit": "報名", "submitting": "報名中…", "registered": "已報名。確認電郵正發送至你的信箱。", "waitlist": "活動已滿；你已列入候補名單，有名額時我們會電郵通知你。", "already": "此電郵已報名參加本活動。", "invalid": "請檢查姓名、電郵及 WhatsApp 號碼，然後再試。", "rateLimited": "此連線嘗試次數過多，請稍後再試。", "closed": "本活動已截止報名。", "external": "本活動於主辦機構網站接受報名。", "unavailable": "目前無法報名。"}` and `registerExternally: "前往主辦機構網站報名"`.

```ts
// app/api/events/guest/cancel/route.ts
import {unsubscribeEnv} from "@/lib/config/env";
import {contactWriterActor} from "@/lib/db/repos/contacts";
import {eventGuestsRepository} from "@/lib/db/repos/event-guests";
import {cancelTokenDigest} from "@/lib/events/guest-registration-core";

export const dynamic = "force-dynamic";

/** One-click cancel from the confirmation email. GET so the link works from any mail client; the token is single-purpose and unguessable. */
export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!/^[0-9a-f]{32}$/.test(token)) return Response.redirect(new URL("/events?guest=invalid", request.url), 303);
  const outcome = await eventGuestsRepository.cancelByToken(contactWriterActor("event_guest"), cancelTokenDigest(unsubscribeEnv().unsubscribeTokenSecret, token)).catch(() => "unknown" as const);
  return Response.redirect(new URL(`/events?guest=${outcome}`, request.url), 303);
}
```

On `/events`, read `query.guest` and when it is `cancelled` render a `role="status"` paragraph with `t("guest.cancelled")` ("Your registration has been cancelled." / "你的報名已取消。") beneath the hero; `invalid`/`unknown` render `t("guest.cancelInvalid")` ("That cancel link is not valid any more." / "此取消連結已失效。"). Register the route in the protected inventory (`id: "api-events-guest-cancel"`, family `api`, classification `api-handler`, `dataOwner: "Guest RSVP one-click cancel (Phase B1, B-4)."`) and raise the ownership pins by one more (`50` routes, api-handler `10`, api family `21`).

- [ ] **Step 5: Run tests, audit, typecheck, lint**

Run: `npx vitest run tests/unit/event-guests-repository.test.ts tests/unit/guest-registration-service.test.ts tests/unit/contacts-repository.test.ts tests/unit/email-catalog.test.ts tests/unit/email-render-snapshots.test.tsx tests/unit/wt-pages/event-detail-page.test.tsx tests/unit/wt-pages/events-page.test.tsx tests/unit/event-detail-seo.test.ts tests/unit/server-action-actor-boundary.test.ts tests/unit/wisetech-protected-route-ownership.test.ts --reporter=dot && npm run audit:strings && npm run typecheck && npx eslint lib/db/repos/event-guests.ts lib/events components/marketing/guest-rsvp-form.tsx app/api/events "app/[locale]/(public)/events"`
Expected: PASS. `event-detail-page.test.tsx` mocks the events repository; extend its fixture with `registrationMode: "rsvp"` and mock `@/lib/events/guest-registration-action` as `{submitGuestRsvpAction: vi.fn()}` and `@/lib/auth/actor` as `{getActor: async () => null}`.

- [ ] **Step 6: Commit**

```bash
git add lib/db/repos/event-guests.ts lib/db/repos/index.ts lib/db/repos/contacts.ts lib/db/repos/events.ts lib/events lib/email/catalog.ts components/marketing/guest-rsvp-form.tsx app/api/events "app/[locale]/(public)/events" config/wisetech-protected-route-inventory.ts messages tests/unit/event-guests-repository.test.ts tests/unit/guest-registration-service.test.ts tests/unit/contacts-repository.test.ts tests/unit/__snapshots__ tests/unit/wt-pages tests/unit/wisetech-protected-route-ownership.test.ts
git commit -m "feat(events): guest RSVP with waitlist, contact upsert, confirmation email and one-click cancel (B-4)"
```

---

### Task 7: Merged attendee list and CSV export (B-4)

**Files:**
- Create: `lib/admin/event-attendees.ts`, `app/api/admin/events/[id]/attendees.csv/route.ts`
- Modify: `lib/db/repos/events.ts` (`listEventAttendees` unions guests), `components/admin/attendee-table.tsx` (guest rows, no check-in button for guests yet), `app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx` (export link), route inventory pins (+1 api), `messages/*`
- Test: `tests/unit/event-attendees-csv.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/event-attendees-csv.test.ts
import {describe, expect, it, vi} from "vitest";

import {attendeesCsv, createAttendeesCsvGet} from "@/lib/admin/event-attendees";

const EVENT = "22222222-2222-4222-8222-222222222222";
const rows = [
  {kind: "member" as const, profileId: "p1", displayName: "Ada", email: "ada@x.hk", organisation: null, status: "registered", checkedInAt: null},
  {kind: "guest" as const, profileId: null, displayName: "Bob \"B\"", email: "bob@x.hk", organisation: "Acme, Ltd", status: "waitlist", checkedInAt: null},
];

describe("attendee CSV (programme B-4)", () => {
  it("quotes fields and lists members and guests", () => {
    const csv = attendeesCsv(rows);
    expect(csv.split("\n")[0]).toBe("kind,name,email,organisation,status,checked_in_at");
    expect(csv).toContain('guest,"Bob ""B""",bob@x.hk,"Acme, Ltd",waitlist,');
  });

  it("returns 404 for a non-admin and a csv attachment for staff", async () => {
    const get = createAttendeesCsvGet({actor: async () => { throw new Error("UNAUTHORIZED"); }, list: vi.fn(async () => rows)});
    expect((await get(new Request("https://x/api/admin/events/x/attendees.csv"), {params: Promise.resolve({id: EVENT})})).status).toBe(404);
    const ok = createAttendeesCsvGet({actor: async () => ({kind: "staff", userId: "s", profileId: "s1"}), list: vi.fn(async () => rows)});
    const response = await ok(new Request("https://x/api/admin/events/x/attendees.csv"), {params: Promise.resolve({id: EVENT})});
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(`attendees-${EVENT}.csv`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run tests/unit/event-attendees-csv.test.ts --reporter=dot` → FAIL, module not found.

- [ ] **Step 3: Union guests into the attendee read, add the CSV**

In `lib/db/repos/events.ts` replace `listEventAttendees`' select with a raw union (keep `requireAdmin` first):

```ts
export type EventAttendee = Readonly<{kind: "member" | "guest"; profileId: string | null; guestId: string | null; displayName: string; email: string | null; organisation: string | null; status: string; checkedInAt: Date | null}>;

export async function listEventAttendees(actor: Actor, eventIdInput: unknown, deps: MemberEventDependencies = {}): Promise<EventAttendee[]> {
  requireAdmin(actor);
  const eventId = eventIdSchema.parse(eventIdInput);
  const database = await memberDatabase(deps);
  const rows = rowsFrom(await database.execute(sql`
    SELECT 'member' AS kind, r.profile_id, NULL::uuid AS guest_id, p.display_name, p.email, NULL::text AS organisation, r.status::text AS status, r.checked_in_at
    FROM event_registrations r JOIN profiles p ON p.id = r.profile_id WHERE r.event_id = ${eventId}
    UNION ALL
    SELECT 'guest', NULL, g.id, g.name, g.email, g.organisation, g.status::text, g.checked_in_at
    FROM ${eventGuestRegistrations} g WHERE g.event_id = ${eventId}
    ORDER BY display_name ASC
  `));
  return rows.map((row) => ({
    kind: row.kind === "guest" ? "guest" : "member", profileId: typeof row.profile_id === "string" ? row.profile_id : null,
    guestId: typeof row.guest_id === "string" ? row.guest_id : null, displayName: String(row.display_name ?? ""),
    email: typeof row.email === "string" ? row.email : null, organisation: typeof row.organisation === "string" ? row.organisation : null,
    status: String(row.status), checkedInAt: row.checked_in_at ? new Date(String(row.checked_in_at)) : null,
  }));
}
```

Update `tests/unit/admin-events.test.ts` / any test that pins `listAttendees` rows to the new shape (`kind: "member"`, `guestId: null`, `organisation: null`).

```ts
// lib/admin/event-attendees.ts
import "server-only";

import {z} from "zod";

import {requireAdmin} from "@/lib/auth/authorize";
import {eventsRepository, type EventAttendee} from "@/lib/db/repos/events";
import type {Actor} from "@/lib/membership/lifecycle";

const cell = (value: string | null | undefined) => {
  const text = value ?? "";
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function attendeesCsv(rows: readonly EventAttendee[]): string {
  const header = "kind,name,email,organisation,status,checked_in_at";
  const lines = rows.map((row) => [row.kind, cell(row.displayName), cell(row.email), cell(row.organisation), row.status, row.checkedInAt ? row.checkedInAt.toISOString() : ""].join(","));
  return [header, ...lines].join("\n") + "\n";
}

export function createAttendeesCsvGet(options: Readonly<{actor: () => Promise<Actor>; list: (actor: Actor, eventId: string) => Promise<readonly EventAttendee[]>}>) {
  return async function GET(_request: Request, context: Readonly<{params: Promise<{id: string}>}>): Promise<Response> {
    let actor: Actor;
    try { actor = await options.actor(); requireAdmin(actor); } catch { return new Response("Not found", {status: 404}); }
    const parsed = z.string().uuid().safeParse((await context.params).id);
    if (!parsed.success) return new Response("Not found", {status: 404});
    const rows = await options.list(actor, parsed.data);
    return new Response(attendeesCsv(rows), {status: 200, headers: {"content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="attendees-${parsed.data}.csv"`, "cache-control": "no-store"}});
  };
}

export const attendeesCsvGet = createAttendeesCsvGet({
  actor: async () => { const {requireAdminActor} = await import("@/lib/auth/actor"); return requireAdminActor(); },
  list: (actor, eventId) => eventsRepository.listAttendees(actor, eventId),
});
```

```ts
// app/api/admin/events/[id]/attendees.csv/route.ts
import {attendeesCsvGet} from "@/lib/admin/event-attendees";

export const dynamic = "force-dynamic";
export const GET = attendeesCsvGet;
```

`components/admin/attendee-table.tsx`: take `EventAttendee` rows; render a `kind` column (`labels.kinds.member` / `labels.kinds.guest`), organisation, and disable the check-in button for guests (guest check-in lands with Phase D ticketing). On the `[id]` admin page add `<a className="text-primary underline" href={\`/api/admin/events/${event.id}/attendees.csv\`}>{t("exportCsv")}</a>` above the table (a plain API path, no locale). Strings `Admin.eventsMgmt`: en `"exportCsv": "Download attendees (CSV)", "kinds": {"member": "Member", "guest": "Guest"}, "organisation": "Organisation"`; zh-HK `"exportCsv": "下載出席名單（CSV）", "kinds": {"member": "會員", "guest": "訪客"}, "organisation": "機構"`. Inventory: `id: "api-admin-event-attendees-csv"`, `routePath: "/api/admin/events/[id]/attendees.csv"`, pins +1 (`51`, api-handler `11`, api family `22`).

- [ ] **Step 4: Run tests, audit, typecheck, lint** — `npx vitest run tests/unit/event-attendees-csv.test.ts tests/unit/admin-events.test.ts tests/unit/event-check-in.test.ts tests/unit/wisetech-protected-route-ownership.test.ts --reporter=dot && npm run audit:strings && npm run typecheck && npx eslint lib/admin/event-attendees.ts app/api/admin/events components/admin/attendee-table.tsx "app/[locale]/(admin)/admin/events-mgmt"` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/repos/events.ts lib/admin/event-attendees.ts app/api/admin/events components/admin/attendee-table.tsx "app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx" config/wisetech-protected-route-inventory.ts messages tests/unit/event-attendees-csv.test.ts tests/unit/admin-events.test.ts tests/unit/wisetech-protected-route-ownership.test.ts
git commit -m "feat(admin): attendee list unions guests and exports CSV (B-4)"
```

---

### Task 8: 24-hour reminder journey for member registrations (B-5, S-2)

**Files:**
- Modify: `lib/automation/types.ts` (`JourneyName` + `"event_reminder"`), `config/journeys.ts`, `lib/email/catalog.ts` (`event_reminder_24h`), `config/whatsapp-templates.ts` (`event_reminder_24h` → `wtia_event_reminder_24h`), `messages/*` (`Email.templates.event_reminder_24h`)
- Create: `lib/events/reminder-enrollment.ts`
- Modify: `lib/db/repos/events.ts` (`registerForEvent` calls the enrolment after commit via an injected `enrollReminder` dependency), `lib/automation/journey-runner.ts` `loadContext` (event title/url variables)
- Test: `tests/unit/event-reminder-enrollment.test.ts`, extend `tests/unit/journey-scheduling.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/event-reminder-enrollment.test.ts
import {describe, expect, it, vi} from "vitest";

import {enrollEventReminder} from "@/lib/events/reminder-enrollment";

const EVENT = "22222222-2222-4222-8222-222222222222";

describe("event reminder enrolment (programme B-5)", () => {
  it("schedules one transactional step 24 hours before the start, keyed per profile and event", async () => {
    const enroll = vi.fn(async () => "created" as const);
    await enrollEventReminder({profileId: "p1", eventId: EVENT, startsAt: new Date("2030-03-01T02:00:00.000Z")}, {journeys: {enroll}, now: () => new Date("2026-09-09T00:00:00Z")});
    expect(enroll).toHaveBeenCalledTimes(1);
    const [, enrollment] = enroll.mock.calls[0] as unknown as [unknown, {journey: string; stepKey: string; scheduledAt: Date; deliveryKey: string}];
    expect(enrollment).toMatchObject({journey: "event_reminder", stepKey: "reminder_24h"});
    expect(enrollment.scheduledAt.toISOString()).toBe("2030-02-28T02:00:00.000Z");
    expect(enrollment.deliveryKey).toBe(`journey:p1:event_reminder:event:${EVENT}:reminder_24h`);
  });

  it("skips events starting within 24 hours", async () => {
    const enroll = vi.fn(async () => "created" as const);
    await enrollEventReminder({profileId: "p1", eventId: EVENT, startsAt: new Date("2026-09-09T10:00:00Z")}, {journeys: {enroll}, now: () => new Date("2026-09-09T00:00:00Z")});
    expect(enroll).not.toHaveBeenCalled();
  });
});
```

Append to `tests/unit/journey-scheduling.test.ts`: `it("defines event_reminder as a single transactional email+whatsapp step at -1 day", () => { expect(JOURNEYS.event_reminder).toEqual([expect.objectContaining({key: "reminder_24h", offsetDays: -1, template: "event_reminder_24h", classification: "transactional", channels: ["email", "whatsapp"]})]); });`

- [ ] **Step 2: Run tests to verify they fail** — `npx vitest run tests/unit/event-reminder-enrollment.test.ts tests/unit/journey-scheduling.test.ts --reporter=dot` → FAIL.

- [ ] **Step 3: Define the journey, template and enrolment**

`lib/automation/types.ts`: `export type JourneyName = "onboarding_90d" | "renewal" | "dunning" | "winback" | "event_reminder";`. `config/journeys.ts`: add `event_reminder: [step("reminder_24h", -1, "event_reminder_24h", "transactional", ["email", "whatsapp"])],`. `lib/email/catalog.ts`: add `"event_reminder_24h"` to `EMAIL_TEMPLATE_IDS`, classification `transactional`; copy — en `{"subject": "Tomorrow: {eventTitle}", "preview": "Your WTIA event is tomorrow.", "heading": "See you tomorrow", "body": "{eventTitle} starts at {startsAt}. {venue}", "cta": "Event details"}`, zh-HK `{"subject": "明天：{eventTitle}", "preview": "你的 WTIA 活動明天舉行。", "heading": "明天見", "body": "{eventTitle} 將於 {startsAt} 開始。{venue}", "cta": "活動詳情"}`. `config/whatsapp-templates.ts`: add `event_reminder_24h: {name: "wtia_event_reminder_24h", languageCode: "en_US", variables: ["memberName", "eventTitle", "startsAt", "eventUrl"], approvalRequirement: "Utility template; submit with the Phase A batch (spec §8.3)."}` — the runner only sends WhatsApp when the key is in `WOZTELL_APPROVED_TEMPLATE_KEYS`, so until approval the step delivers by email alone.

```ts
// lib/events/reminder-enrollment.ts
import "server-only";

import {automationSystemActor} from "@/lib/auth/automation-actor";
import {journeysRepository} from "@/lib/db/repos/journeys";

export type ReminderEnrollmentDependencies = Readonly<{journeys: Pick<typeof journeysRepository, "enroll">; now?: () => Date}>;

/**
 * S-2: one journey_state row per (profile, event), scheduled 24 h before the
 * start. Anchored on the event, not on "now", so the existing runner's
 * `scheduled_at <= now` claim fires it at the right time. Events starting
 * inside 24 h get no reminder — the confirmation just sent is the reminder.
 */
export async function enrollEventReminder(input: Readonly<{profileId: string; eventId: string; startsAt: Date}>, deps: ReminderEnrollmentDependencies = {journeys: journeysRepository}): Promise<void> {
  const now = (deps.now ?? (() => new Date()))();
  const scheduledAt = new Date(input.startsAt.getTime() - 24 * 60 * 60 * 1000);
  if (scheduledAt <= now) return;
  await deps.journeys.enroll(automationSystemActor("event-registration"), {
    profileId: input.profileId, journey: "event_reminder", instanceKey: `event:${input.eventId}`, stepKey: "reminder_24h",
    scheduledAt, deliveryKey: `journey:${input.profileId}:event_reminder:event:${input.eventId}:reminder_24h`,
  });
}
```

Read `lib/auth/automation-actor.ts` for the exact factory name of the automation system actor and `lib/db/repos/journeys.ts:149` for the exact `JourneyEnrollment` field names; match them (the test asserts `journey`, `stepKey`, `scheduledAt`, `deliveryKey`). In `registerForEvent` (events.ts :296) accept `enrollReminder?: (input) => Promise<void>` in `EventRegistrationDependencies`, defaulting to `enrollEventReminder`, and call it after the transaction commits with a `disposition === "registered"` result (waitlisted members are not reminded); wrap in `.catch(() => undefined)` so a journey failure never fails a registration. In `journey-runner.ts` `loadContext` (via `lib/db/repos/job-runner-context.ts`) add, when `claim.journey === "event_reminder"`, the variables `eventTitle`, `startsAt` (Hong Kong formatted), `venue`, `eventUrl` read from `events` by the id in `instanceKey` (`event:<id>`), and set `ctaUrl` to the localized `/events/<slug>` absolute URL. Extend `tests/unit/journey-runner.test.ts` with one case that an `event_reminder` claim renders `event_reminder_24h` with those variables.

- [ ] **Step 4: Run tests** — `npx vitest run tests/unit/event-reminder-enrollment.test.ts tests/unit/journey-scheduling.test.ts tests/unit/journey-runner.test.ts tests/unit/journey-conditions.test.ts tests/unit/email-catalog.test.ts tests/unit/email-render-snapshots.test.tsx tests/unit/admin-events.test.ts --reporter=dot && npm run typecheck` → PASS (accept the one new email snapshot after reading it).

- [ ] **Step 5: Commit**

```bash
git add lib/automation/types.ts config/journeys.ts lib/email/catalog.ts config/whatsapp-templates.ts lib/events/reminder-enrollment.ts lib/db/repos/events.ts lib/db/repos/job-runner-context.ts lib/automation/journey-runner.ts messages tests/unit/event-reminder-enrollment.test.ts tests/unit/journey-scheduling.test.ts tests/unit/journey-runner.test.ts tests/unit/__snapshots__
git commit -m "feat(automation): event_reminder journey enrols member registrations 24h before start (B-5)"
```

---

### Task 9: Public discovery — `/events` filters, organiser block, `Event.organizer` (B-6 events half)

**Files:**
- Create: `lib/events/filters.ts`, `components/marketing/event-filter-panel.tsx`
- Modify: `lib/db/repos/events.ts` (`listPublicEvents` accepts `filters`), `lib/events/public.ts` (`PublicEventProjection` gains `format`, `tags`, `organiser`), `app/[locale]/(public)/events/page.tsx`, `app/[locale]/(public)/events/[slug]/page.tsx` (organiser block), `lib/structured-data.ts` (`buildEventData` organizer from record), `messages/*` (`Events.filters`, `Events.detail.organiser`)
- Test: `tests/unit/event-filters.test.ts`, extend `tests/unit/public-event-repository.test.ts`, `tests/unit/wt-pages/events-page.test.tsx`, `tests/unit/structured-data.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/event-filters.test.ts
import {describe, expect, it} from "vitest";

import {eventFilterQuery, parseEventFilters} from "@/lib/events/filters";

describe("event filters (programme B-6)", () => {
  it("parses format, month, organiser and tag and ignores junk", () => {
    expect(parseEventFilters({format: "online", month: "2026-10", organiser: "acme", tag: "AI"})).toEqual({format: "online", month: "2026-10", organiser: "acme", tag: "ai"});
    expect(parseEventFilters({format: "tv", month: "2026-13", organiser: "../x", tag: "a".repeat(80)})).toEqual({format: null, month: null, organiser: null, tag: null});
    expect(parseEventFilters({})).toEqual({format: null, month: null, organiser: null, tag: null});
  });

  it("round-trips to a query string without empty keys", () => {
    expect(eventFilterQuery({format: "hybrid", month: null, organiser: null, tag: "ai"}, "past")).toBe("status=past&format=hybrid&tag=ai");
    expect(eventFilterQuery({format: null, month: null, organiser: null, tag: null}, "open")).toBe("status=open");
  });
});
```

Append to `tests/unit/public-event-repository.test.ts`:

```ts
  it("applies format, month (Hong Kong), organiser slug and tag filters", async () => {
    const source = sourceFrom([
      eventRow({slug: "online-oct", startsAt: new Date("2026-10-05T02:00:00Z"), format: "online", tags: ["ai"], organiserSlug: "acme"}),
      eventRow({slug: "in-person-nov", startsAt: new Date("2026-11-05T02:00:00Z"), format: "in_person", tags: ["health"], organiserSlug: null}),
    ]);
    const read = (filters: Parameters<typeof listPublicEvents>[1]["filters"]) => listPublicEvents(anonymous, {status: "open", asOf: new Date("2026-09-01T00:00:00Z"), locale: "en", filters}, source).then((rows) => rows.map((row) => row.slug));
    await expect(read({format: "online", month: null, organiser: null, tag: null})).resolves.toEqual(["online-oct"]);
    await expect(read({format: null, month: "2026-11", organiser: null, tag: null})).resolves.toEqual(["in-person-nov"]);
    await expect(read({format: null, month: null, organiser: "acme", tag: null})).resolves.toEqual(["online-oct"]);
    await expect(read({format: null, month: null, organiser: null, tag: "health"})).resolves.toEqual(["in-person-nov"]);
  });
```

Append to `tests/unit/structured-data.test.ts`: `buildEventData({slug: "x", startsAt: new Date("2030-03-01T02:00:00Z"), endsAt: null, venue: null, organiser: {name: "Acme Ltd", url: "https://hkwtia.example/members/acme"}}, "X", "en")` has `organizer` `{@type: "Organization", name: "Acme Ltd", url: "https://hkwtia.example/members/acme"}`, while an event without an organiser keeps the WTIA organizer it emits today.

In `tests/unit/wt-pages/events-page.test.tsx` add one case: rendering with `{format: "online"}` calls `listPublic` with `expect.objectContaining({filters: expect.objectContaining({format: "online"})})` and the filter panel's `format` select has `online` selected.

- [ ] **Step 2: Run tests to verify they fail** — `npx vitest run tests/unit/event-filters.test.ts tests/unit/public-event-repository.test.ts tests/unit/structured-data.test.ts tests/unit/wt-pages/events-page.test.tsx --reporter=dot` → FAIL.

- [ ] **Step 3: Filters helper, repository predicate, projection**

```ts
// lib/events/filters.ts
import type {PublicEventStatus} from "@/lib/events/public";

export type EventFilters = Readonly<{format: "in_person" | "online" | "hybrid" | null; month: string | null; organiser: string | null; tag: string | null}>;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const first = (value: string | readonly string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

/** URL state for /events. Every field is optional and independently validated; anything else is null. */
export function parseEventFilters(query: Record<string, string | readonly string[] | undefined>): EventFilters {
  const format = first(query.format);
  const month = first(query.month);
  const organiser = first(query.organiser).toLowerCase();
  const tag = first(query.tag).trim().toLowerCase();
  const monthValid = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  return {
    format: format === "in_person" || format === "online" || format === "hybrid" ? format : null,
    month: monthValid ? month : null,
    organiser: SLUG.test(organiser) && organiser.length <= 96 ? organiser : null,
    tag: tag.length > 0 && tag.length <= 40 && SLUG.test(tag) ? tag : null,
  };
}

export function eventFilterQuery(filters: EventFilters, status: PublicEventStatus): string {
  const params = new URLSearchParams({status});
  if (filters.format) params.set("format", filters.format);
  if (filters.month) params.set("month", filters.month);
  if (filters.organiser) params.set("organiser", filters.organiser);
  if (filters.tag) params.set("tag", filters.tag);
  return params.toString();
}

/** Month bounds in Asia/Hong_Kong for a `YYYY-MM` value. */
export function hongKongMonthBounds(month: string): Readonly<{start: Date; end: Date}> {
  const [year, monthIndex] = month.split("-").map(Number);
  const offset = 8 * 60 * 60 * 1000;
  return {start: new Date(Date.UTC(year, monthIndex - 1, 1) - offset), end: new Date(Date.UTC(year, monthIndex, 1) - offset)};
}
```

In `lib/db/repos/events.ts`: add `filters?: EventFilters` to `PublicEventReadOptions` and `PublicEventCountOptions`; in `listPublicEvents`/`countPublicEvents` build extra predicates — `filters.format` → `eq(events.format, filters.format)`; `filters.month` → `gte(events.startsAt, start), lt(events.startsAt, end)` from `hongKongMonthBounds`; `filters.tag` → `sql\`${events.tags} @> ARRAY[${filters.tag}]::text[]\``; `filters.organiser` → `eq(companies.slug, filters.organiser)` through a `leftJoin(companies, eq(companies.id, events.organiserCompanyId))` (the `companies.slug` column is added by Phase B2 Task 1; until that lands, the organiser filter matches against `lower(replace(companies.display_name, ' ', '-'))` — write it as `sql\`lower(regexp_replace(${companies.displayName}, '[^a-z0-9]+', '-', 'gi')) = ${filters.organiser}\`` and replace it with `eq(companies.slug, …)` when B2 merges). The in-memory `source` used by the unit test filters the same way in JS; extend the test's source implementation accordingly (it already re-implements the where clause).

`lib/events/public.ts`: extend `PublicEventProjection` with `format: "in_person" | "online" | "hybrid"`, `onlineUrl: string | null`, `tags: readonly string[]`, `registrationMode: "rsvp" | "external" | "ticketed"`, `externalRegistrationUrl: string | null`, `organiser: {name: string; slug: string | null} | null`; select `companies.display_name AS organiser_name` (and `companies.slug` once B2 lands) in the projection query.

- [ ] **Step 4: Filter panel, page wiring, organiser block, JSON-LD**

```tsx
// components/marketing/event-filter-panel.tsx
import type {AppLocale} from "@/i18n/routing";
import type {EventFilters} from "@/lib/events/filters";
import type {PublicEventStatus} from "@/lib/events/public";
import {localizedPath} from "@/lib/urls";

type Labels = Readonly<{legend: string; format: string; formats: Readonly<{any: string; in_person: string; online: string; hybrid: string}>; month: string; organiser: string; tag: string; apply: string; clear: string}>;

export function EventFilterPanel({locale, status, filters, labels}: Readonly<{locale: AppLocale; status: PublicEventStatus; filters: EventFilters; labels: Labels}>) {
  const select = "min-h-11 w-full rounded-md border border-input bg-background px-3";
  return (
    <form action={localizedPath(locale, "/events")} className="event-filter-panel" method="get">
      <fieldset className="event-filter-grid">
        <legend className="sr-only">{labels.legend}</legend>
        <input name="status" type="hidden" value={status} />
        <label><span>{labels.format}</span>
          <select className={select} defaultValue={filters.format ?? ""} name="format">
            <option value="">{labels.formats.any}</option>
            {(["in_person", "online", "hybrid"] as const).map((key) => <option key={key} value={key}>{labels.formats[key]}</option>)}
          </select></label>
        <label><span>{labels.month}</span><input className={select} defaultValue={filters.month ?? ""} name="month" type="month" /></label>
        <label><span>{labels.organiser}</span><input className={select} defaultValue={filters.organiser ?? ""} name="organiser" type="text" /></label>
        <label><span>{labels.tag}</span><input className={select} defaultValue={filters.tag ?? ""} name="tag" type="text" /></label>
      </fieldset>
      <div className="directory-actions">
        <button className="button" type="submit">{labels.apply}</button>
        <a className="text-link" href={`${localizedPath(locale, "/events")}?status=${status}`}>{labels.clear}</a>
      </div>
    </form>
  );
}
```

`app/styles/wisetech.css` already styles `.event-filter-panel`, `.event-filter-grid` and `.directory-actions` (lines 362-363, 450, 454); no CSS change.

In `app/[locale]/(public)/events/page.tsx`: `const filters = parseEventFilters(query);` pass `filters` to `listPublic`; render `<EventFilterPanel filters={filters} labels={…} locale={appLocale} status={status} />` between the quick tabs and the results head; make the `EventViewSwitch` and pagination-free links carry the filters via `eventFilterQuery(filters, status)`. On the detail page, when `event.organiser` is set render an organiser block in the facts list: `t("detail.organiser")` + the name (link to `localizedPath(locale, \`/members/${slug}\`)` only when `slug` is non-null, which B2 provides). In `lib/structured-data.ts` extend `EventDataRecord` with `organiser?: {name: string; url: string | null} | null` and emit `organizer: record.organiser ? {"@type": "Organization", name: record.organiser.name, ...(record.organiser.url ? {url: record.organiser.url} : {})} : <the current WTIA organizer object>`; also add `eventAttendanceMode` from `format` (`OnlineEventAttendanceMode` / `OfflineEventAttendanceMode` / `MixedEventAttendanceMode`) when the record carries `format`.

Strings `Events.filters` — en: `{"legend": "Filter events", "format": "Format", "formats": {"any": "Any format", "in_person": "In person", "online": "Online", "hybrid": "Hybrid"}, "month": "Month", "organiser": "Organiser", "tag": "Topic", "apply": "Apply filters", "clear": "Clear"}`, `Events.detail.organiser: "Organised by"`; zh-HK: `{"legend": "篩選活動", "format": "形式", "formats": {"any": "任何形式", "in_person": "實體", "online": "網上", "hybrid": "混合"}, "month": "月份", "organiser": "主辦機構", "tag": "主題", "apply": "套用篩選", "clear": "清除"}`, `organiser: "主辦"`.

- [ ] **Step 5: Run tests, audit, typecheck, lint** — `npx vitest run tests/unit/event-filters.test.ts tests/unit/public-event-repository.test.ts tests/unit/structured-data.test.ts tests/unit/wt-pages/events-page.test.tsx tests/unit/wt-pages/event-detail-page.test.tsx tests/unit/event-detail-seo.test.ts tests/unit/event-card.test.tsx tests/unit/sitemap.test.ts --reporter=dot && npm run audit:strings && npm run typecheck && npx eslint lib/events components/marketing/event-filter-panel.tsx lib/structured-data.ts "app/[locale]/(public)/events"` → PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/events lib/db/repos/events.ts components/marketing/event-filter-panel.tsx lib/structured-data.ts "app/[locale]/(public)/events" messages tests/unit/event-filters.test.ts tests/unit/public-event-repository.test.ts tests/unit/structured-data.test.ts tests/unit/wt-pages
git commit -m "feat(events): format/month/organiser/tag filters on /events, organiser block and Event.organizer JSON-LD (B-6)"
```

---

### Task 10: Acceptance spec and gate (B-8)

**Files:**
- Create: `tests/e2e/phase-b1-member-events.spec.ts`
- Modify: `docs/superpowers/plans/2026-09-09-phase-b1-member-events.md` (exit checklist status)

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/phase-b1-member-events.spec.ts
import {readFileSync} from "node:fs";

import {expect, test} from "@playwright/test";

import {missingM2LiveEnvironment, signInForM2} from "../fixtures/m2-auth";

type Bundle = Readonly<{
  Events: Readonly<{filters: Readonly<{apply: string; formats: Readonly<{online: string}>}>; guest: Readonly<{submit: string; registered: string; waitlist: string; already: string}>}>;
  Portal: Readonly<{memberEvents: Readonly<{newTitle: string; submit: string; submitted: string; saveDraft: string; draftSaved: string}>}>;
  Admin: Readonly<{eventsMgmt: Readonly<{review: Readonly<{title: string; approve: string}>}>}>;
}>;
const bundle = (locale: "en" | "zh-HK") => JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as Bundle;
const locales = [{locale: "en" as const, prefix: ""}, {locale: "zh-HK" as const, prefix: "/zh"}];
const missing = missingM2LiveEnvironment();

for (const {locale, prefix} of locales) {
  const copy = bundle(locale);

  test(`${locale}: /events filter panel round-trips the format filter`, async ({page}) => {
    await page.goto(`${prefix}/events`);
    await page.getByLabel(copy.Events.filters.formats.online, {exact: false}).selectOption("online").catch(() => undefined);
    await page.locator("form.event-filter-panel select[name=format]").selectOption("online");
    await page.locator("form.event-filter-panel button[type=submit]").click();
    await expect(page).toHaveURL(/format=online/);
    await expect(page.locator("form.event-filter-panel select[name=format]")).toHaveValue("online");
  });

  test(`${locale}: guest RSVP form validates before writing`, async ({page}) => {
    // Any published rsvp event on the target; skip when the listing is empty.
    await page.goto(`${prefix}/events?status=open`);
    const first = page.locator(".event-library a[href*='/events/']").first();
    test.skip((await first.count()) === 0, "no open events on this target");
    await first.click();
    const form = page.locator("form.guest-rsvp-form");
    test.skip((await form.count()) === 0, "event is not open to guest RSVP");
    await form.locator("input[name=email]").fill("not-an-email");
    await form.getByRole("button", {name: copy.Events.guest.submit}).click();
    await expect(form.locator("#guest-rsvp-status")).toHaveClass(/form-error/);
  });
}

test.describe("member publishing and staff review", () => {
  test.skip(missing.length > 0, `Requires ${missing.join(", ")}`);

  for (const {locale, prefix} of locales) {
    const copy = bundle(locale);
    test(`${locale}: company admin submits an event and staff sees it in review`, async ({page, browser}) => {
      await signInForM2(page, "company-admin");
      await page.goto(`${prefix}/portal/events/new`);
      await expect(page.getByRole("heading", {level: 1, name: copy.Portal.memberEvents.newTitle})).toBeVisible();
      const slug = `e2e-${locale === "en" ? "en" : "zh"}-${Date.now()}`;
      await page.fill("input[name=slug]", slug);
      await page.fill("input[name=titleEn]", `E2E ${slug}`);
      await page.fill("textarea[name=descriptionEn]", "Playwright acceptance event");
      await page.fill("input[name=startsAt]", "2031-01-15T10:00");
      await page.getByRole("button", {name: copy.Portal.memberEvents.saveDraft}).click();
      await expect(page.getByText(copy.Portal.memberEvents.draftSaved)).toBeVisible();
      await page.getByRole("button", {name: copy.Portal.memberEvents.submit}).click();
      await expect(page.getByText(copy.Portal.memberEvents.submitted)).toBeVisible();

      const staffContext = await browser.newContext();
      const staffPage = await staffContext.newPage();
      await signInForM2(staffPage, "staff");
      await staffPage.goto(`${prefix}/admin/events-mgmt`);
      await expect(staffPage.getByRole("heading", {name: copy.Admin.eventsMgmt.review.title})).toBeVisible();
      await expect(staffPage.getByRole("link", {name: `E2E ${slug}`})).toBeVisible();
      await staffContext.close();
    });
  }
});
```

- [ ] **Step 2: Run the anonymous cases against a Preview and the gated cases against the isolated M2 environment**

Run: `PLAYWRIGHT_BASE_URL=<preview url> npx playwright test tests/e2e/phase-b1-member-events.spec.ts --reporter=line` (Vercel-protected Previews need the share session `scripts/vercel-preview-session.mjs` writes; see WP-8 notes).
Expected: anonymous cases pass or skip with the stated reason; gated cases pass where `M2_TEST_*` are set. The company-admin fixture's company must hold a Startup or Corporate membership; if the isolated seed gives it Community, the submit button is disabled by design and the case must be adjusted to assert that state instead.

- [ ] **Step 3: Shard the unit suite in CI (B-8)**

The `quality` job in `.github/workflows/ci.yml` runs `npm test` on one runner (~2.5 min locally on 8 cores, longer on the 2-vCPU runner). Split it into a two-way matrix so the events and directory phases do not push CI past its comfort zone. Replace the single job with:

```yaml
jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm ls --package-lock-only @neondatabase/auth @neondatabase/auth-ui better-auth better-call
        timeout-minutes: 1
      - run: npm run audit:strings
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run build
      - run: npm audit --omit=dev --audit-level=high
  tests:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx vitest run --shard=${{ matrix.shard }}/2
  quality:
    needs: [checks, tests]
    runs-on: ubuntu-latest
    steps:
      - run: echo "quality gate passed"
```

Keeping a job named `quality` that depends on the others preserves the branch-protection check name that PRs #47–#49 were gated on. Verify on the PR that three jobs run and `quality` turns green last.

- [ ] **Step 4: Full gate**

Run: `npm run audit:strings && npm test && npm run lint && npm run typecheck && NEXT_PUBLIC_SITE_URL=https://hkwtia.vercel.app npm run build`
Expected: all green.

- [ ] **Step 5: Commit and record**

```bash
git add tests/e2e/phase-b1-member-events.spec.ts .github/workflows/ci.yml
git commit -m "test(e2e): Phase B1 member events acceptance spec and sharded CI (B-8)"
```

Then update the exit checklist below in the same PR.

---

## Phase B1 exit checklist

**Status (2026-09-09):** Tasks 1–10 landed on `feat/phase-b1-member-events` (`git log --oneline docs/phase-b-plans..HEAD`): Task 1 `7592799`, `1df332f` · Task 2 `34436f2`, `ba739e9` · Task 3 `82fd0f9`, `5da1705`, `3193d13` · Task 4 `097d3f5`, `fb4f098` · Task 5 `323f413`, `82ff438` · Task 6 `47d05f4`, `b402b09` · Task 7 `5d395b3`, `fd398db` · Task 8 `78a1af3`, `e52e3f6` · Task 9 `c0734b1`, `eeb2091` · Task 10 `1004eb8` (spec + sharded CI; `tests/unit/ci-security-contract.test.ts` re-pinned to the three-job step list, which the plan's Step 3 had not anticipated). Full gate green on the branch head: `audit:strings` passed (239 TSX files); `npm test` 485 files / 4006 tests passed, 15 files / 40 tests skipped, 0 failed; `lint` 0 errors (26 pre-existing warnings); `typecheck` clean; `NEXT_PUBLIC_SITE_URL=https://hkwtia.vercel.app npm run build` compiled and generated 140/140 static pages. `tests/e2e/phase-b1-member-events.spec.ts` run locally against the managed `next dev` server (no Preview, no local database; `NEXT_PUBLIC_SITE_URL` must be set in the shell because `.env.local` carries it empty and `??` does not fall back): `en`/`zh-HK` filter round-trip **passed**; `en`/`zh-HK` guest RSVP **skipped** ("no open events on this target"); both gated publishing cases **skipped** (the M2 live environment is absent). The Preview run of Step 2, the gated cases against the isolated M2 environment, and the owner walk remain open. Two owner actions still block release: (1) apply migrations `0026` and `0027` to production before any promote of a build carrying Task 2+ (first bullet below); (2) submit `wtia_event_reminder_24h` to Woztell/Meta for template approval — reminders go by email only until then (the guest confirmation is email-only by design; no WhatsApp template exists for it).

- [ ] Migrations `0026_phase_b_events_two_sided` and `0027_phase_b_events_backfill` applied to production **before** the deploy carrying Task 2+ (public reads switch to `status`/`visibility`; without the backfill every existing event disappears from `/events`). Use the Phase A recipe: `neonctl connection-string production --project-id fragrant-mountain-25240574 --org-id org-soft-sunset-25251479`, then `DATABASE_URL=… npm run db:migrate`, then verify `SELECT status, count(*) FROM events GROUP BY 1`.
- [ ] Merges to `main` build as Preview only; release with `vercel promote <deployment-url> --scope ynwaforevers-projects` after the migration.
- [ ] Submit `wtia_event_reminder_24h` to Woztell/Meta with the Phase A template batch (spec §8.3); until approved, reminders go by email only. The guest confirmation is email-only; there is no `wtia_event_confirmation_*` template.
- [ ] Deferred to Phase C: B-2's notification of the review result to the submitting member (`wtia_event_review_result_*`, email + WhatsApp) ships with the Phase C notifications dispatcher (C-8). Until then a member learns the outcome from `/portal/events` status.
- [ ] Documented trade-off, Phase C to revisit: `eventGuestsRepository.cancelByToken` is a mutating GET (the emailed cancel link) and writes no `audit_events` row; the token digest is the only proof of intent. Phase C's notifications work should move it behind a confirm POST with an audit row.
- [ ] Gate: a Startup member publishes an event that appears on `/events` with organiser attribution after staff approval; a guest RSVPs without signing in and receives the confirmation email with a working cancel link; `/admin/events-mgmt/[id]` lists the guest and the CSV downloads.
- [ ] Owner walk of the gate in both locales on a Preview, then on production.
- [ ] Phase B2 (`2026-09-09-phase-b2-member-directory.md`) replaces the organiser-name matching in Task 9 with `companies.slug` and links the organiser block to `/members/[slug]`.

