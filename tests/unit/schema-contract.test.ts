import {getTableConfig} from "drizzle-orm/pg-core";
import {describe, expect, expectTypeOf, it} from "vitest";

import * as serverSchema from "@/lib/db/server-schema";

import {
  agentRuns,
  auditEvents,
  companies,
  companyMembers,
  contacts,
  conversations,
  eventGuestRegistrations,
  events,
  jobs,
  leads,
  membershipApplications,
  membershipPlans,
  messages,
  memberships,
  profiles,
  seatInvitations,
  staffTasks,
} from "@/lib/db/server-schema";

import {backfillCompanySlugs} from "@/tests/fixtures/company-slug";

describe("membership schema contract", () => {
  it("defines all M1 application tables", () => {
    expect(profiles).toBeDefined();
    expect(companies).toBeDefined();
    expect(companyMembers).toBeDefined();
    expect(seatInvitations).toBeDefined();
    expect(membershipPlans).toBeDefined();
    expect(membershipApplications).toBeDefined();
    expect(memberships).toBeDefined();
    expect(jobs).toBeDefined();
    expect(auditEvents).toBeDefined();
  });

  it("defines one unique idempotency key for webhook jobs", () => {
    expect(jobs.runKey).toBeDefined();
  });

  it("exposes company and member columns for scoped uniqueness", () => {
    expect(companyMembers.companyId).toBeDefined();
    expect(companyMembers.userId).toBeDefined();
    expect(memberships.companyId).toBeDefined();
    expect(memberships.ownerUserId).toBeDefined();
    expect(membershipPlans.code).toBeDefined();
  });

  it("exposes the Drizzle tables through the server-only runtime wrapper", () => {
    expect(serverSchema.jobs).toBe(jobs);
  });
});

describe("M4A AI concierge schema contract", () => {
  it("exposes the durable knowledge, conversation, message, and run tables", () => {
    expect(serverSchema.kbDocuments).toBeDefined();
    expect(serverSchema.conversations).toBeDefined();
    expect(serverSchema.messages).toBeDefined();
    expect(serverSchema.agentRuns).toBeDefined();
    expect(
      (serverSchema as unknown as Record<string, unknown>).posts,
    ).toBeDefined();
  });

  it("retains all required AI concierge foreign-key relations", () => {
    const conversationForeignKeys = getTableConfig(conversations).foreignKeys;
    const messageForeignKeys = getTableConfig(messages).foreignKeys;
    const agentRunForeignKeys = getTableConfig(agentRuns).foreignKeys;

    expect(conversationForeignKeys.some((foreignKey) => {
      const reference = foreignKey.reference();
      return reference.columns[0] === conversations.profileId
        && reference.foreignTable === profiles
        && reference.foreignColumns[0] === profiles.id;
    })).toBe(true);
    expect(messageForeignKeys.some((foreignKey) => {
      const reference = foreignKey.reference();
      return reference.columns[0] === messages.conversationId
        && reference.foreignTable === conversations
        && reference.foreignColumns[0] === conversations.id;
    })).toBe(true);
    expect(agentRunForeignKeys.some((foreignKey) => {
      const reference = foreignKey.reference();
      return reference.columns[0] === agentRuns.conversationId
        && reference.foreignTable === conversations
        && reference.foreignColumns[0] === conversations.id;
    })).toBe(true);
    expect(agentRunForeignKeys.some((foreignKey) => {
      const reference = foreignKey.reference();
      return reference.columns[0] === agentRuns.profileId
        && reference.foreignTable === profiles
        && reference.foreignColumns[0] === profiles.id;
    })).toBe(true);
  });

  it("records message channels and provider identifiers directly on messages", () => {
    expect(serverSchema.messages.channel).toBeDefined();
    expect(serverSchema.messages.providerMessageId).toBeDefined();
    expect(serverSchema.messages.conversationId).toBeDefined();
  });

  it("supports anonymous escalation with bounded staff-task context", () => {
    expect(serverSchema.staffTasks.profileId).toBeDefined();
    expect(serverSchema.staffTasks.context).toBeDefined();
    expectTypeOf<typeof staffTasks.$inferInsert.profileId>().toEqualTypeOf<string | null | undefined>();
    expectTypeOf<typeof staffTasks.$inferSelect.context>().toEqualTypeOf<{
      contactEmail?: string;
      conversationId?: string;
      agentRunId?: string;
      reasonCode?: string;
      locale?: "en" | "zh-HK";
    }>();
  });

  it("keeps run feedback, lifecycle, and transcript retention queryable", () => {
    expect(serverSchema.agentRuns.csatScore).toBeDefined();
    expect(serverSchema.agentRuns.createdAt).toBeDefined();
    expect(serverSchema.conversations.expiresAt).toBeDefined();
  });
});

describe("phase A contacts and consent contract", () => {
  it("records WhatsApp consent provenance on profiles", () => {
    expect(profiles.whatsappConsentAt).toBeDefined();
    expect(profiles.whatsappConsentSource).toBeDefined();
    expect(profiles.whatsappConsentTextVersion).toBeDefined();
    expect(profiles.marketingConsentAt).toBeDefined();
  });

  it("defines contacts with one row per phone and one per Woztell member id", () => {
    const config = getTableConfig(contacts);
    expect(config.name).toBe("contacts");
    const indexNames = config.indexes.map((index) => index.config.name);
    expect(indexNames).toContain("contacts_phone_unique");
    expect(indexNames).toContain("contacts_whatsapp_member_unique");
    expect(indexNames).toContain("contacts_profile_unique");
    expect(contacts.source).toBeDefined();
    expect(contacts.stage).toBeDefined();
    expect(contacts.whatsappOptedOutAt).toBeDefined();
  });
});

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
    expect(config.indexes.map((index) => index.config.name)).toContain("events_organiser_idx");
    expect(config.checks.map((check) => check.name)).toContain("events_online_url_check");
    expect(config.checks.map((check) => check.name)).toContain("events_external_registration_check");
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

describe("phase B2 company profile contract", () => {
  it("adds public-profile columns and a partial unique slug", () => {
    for (const column of [
      "slug",
      "logoMediaId",
      "tags",
      "taglineEn",
      "taglineZhHk",
      "descriptionZhHk",
      "publicProfileStatus",
      "publicProfilePublishedAt",
      "profileReviewedAt",
      "profileReviewedByProfileId",
      "profileRejectionReason",
    ] as const) {
      expect(companies[column]).toBeDefined();
    }

    const config = getTableConfig(companies);
    const columns = new Map(config.columns.map((column) => [column.name, column]));
    // S-1/D-11 is the whole privacy decision: opt-in, reviewed, hidden by
    // default. Asserting only that the column exists would let a later edit
    // default it to `published`, which publishes every existing company the
    // moment the `/members` list lands.
    expect(columns.get("public_profile_status")?.default).toBe("hidden");
    expect(columns.get("public_profile_status")?.notNull).toBe(true);

    // Partial *and* unique, not merely present: the partial predicate is what
    // lets the legacy rows the 0029 backfill skips keep a NULL slug.
    const slugIndex = config.indexes.find((index) => index.config.name === "companies_slug_unique");
    expect(slugIndex?.config.unique).toBe(true);
    expect(slugIndex?.config.where).toBeDefined();

    // `published` promises an addressable /members/[slug], so the database —
    // not just the repository — refuses a published profile without a slug.
    expect(config.checks.map((check) => check.name)).toContain("companies_public_profile_slug_check");
  });

  it("lets a lead exist without a listing and link to a contact", () => {
    expect(leads.listingId.notNull).toBe(false);
    expect(leads.contactId).toBeDefined();
  });
});

/**
 * The Drizzle assertions above pin the table; nothing pins `drizzle/0029`,
 * whose de-duplication is the part that can silently cost a member their page
 * address. `backfillCompanySlugs` mirrors that migration the way
 * tests/fixtures/event-row.ts mirrors 0027, so the SQL's rules are asserted as
 * behaviour on a machine with no Postgres.
 */
describe("phase B2 slug backfill (drizzle/0029)", () => {
  // The portal's own rule (config S-2). A backfilled slug that fails it would
  // reject the owner's first save of an untouched form.
  const PORTAL_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  function seedRow(id: string, displayName: string, createdAtMinute: number) {
    return {id, displayName, createdAt: new Date(Date.UTC(2026, 8, 9, 0, createdAtMinute))};
  }

  /** The invariants every input must satisfy, whatever the display names are. */
  function backfill(rows: readonly {id: string; displayName: string; createdAt: Date}[]) {
    const derived = backfillCompanySlugs(rows);
    const written = derived.filter((row) => row.slug !== null);

    expect(new Set(written.map((row) => row.slug)).size).toBe(written.length);
    for (const row of written) {
      expect(row.slug).toMatch(PORTAL_SLUG);
      expect(row.slug!.length).toBeGreaterThanOrEqual(2);
      expect(row.slug!.length).toBeLessThanOrEqual(96);
    }
    // A skipped row keeps a NULL slug, and the owner has to type one before
    // `companies_public_profile_slug_check` lets the profile publish. So a row
    // may only be skipped when its candidate is out of bounds, malformed, or
    // genuinely taken by another row.
    for (const row of derived.filter((candidate) => candidate.slug === null)) {
      const outOfBounds = row.candidate.length < 2 || row.candidate.length > 96;
      const malformed = !PORTAL_SLUG.test(row.candidate);
      const taken = derived.some((other) => other.id !== row.id && other.slug === row.candidate);
      expect(outOfBounds || malformed || taken, `row ${row.id} lost the free slug "${row.candidate}"`).toBe(true);
    }
    return new Map(derived.map((row) => [row.id, row.slug]));
  }

  it("slugifies distinct display names without a suffix", () => {
    const slugs = backfill([
      seedRow("c1", "Acme Robotics", 0),
      seedRow("c2", "Widgets Ltd.", 1),
      seedRow("c3", "Hong Kong Data & AI", 2),
    ]);
    expect([...slugs.values()]).toEqual(["acme-robotics", "widgets-ltd", "hong-kong-data-ai"]);
  });

  it("gives the older of two identical names the bare slug and the newer an ordinal", () => {
    const slugs = backfill([seedRow("c1", "Acme", 0), seedRow("c2", "Acme", 1)]);
    expect(slugs.get("c1")).toBe("acme");
    expect(slugs.get("c2")).toBe("acme-2");
  });

  it("skips a name that slugifies to nothing instead of minting a bare ordinal", () => {
    // CJK-only names are ordinary in a zh-HK directory and every one of them
    // slugifies to "". Their n = 1 row is skipped by the length bound, but
    // n = 2 derives `-2`: two characters, colliding with no base (a base can
    // never start with `-`), and rejected by the portal's own regex the moment
    // the owner opens the untouched form and saves it.
    const slugs = backfill([
      seedRow("c1", "香港科技有限公司", 0),
      seedRow("c2", "香港物流有限公司", 1),
      seedRow("c3", "數據與人工智能", 2),
    ]);
    expect([...slugs.values()]).toEqual([null, null, null]);
  });

  it("skips only the ordinal that a real display name already owns", () => {
    // "Acme", "Acme", "Acme 2" derive `acme`, `acme-2` and `acme-2`: exactly
    // one row has to give way, and it is the ordinal, not the row holding the
    // free base.
    const slugs = backfill([seedRow("c1", "Acme", 0), seedRow("c2", "Acme", 1), seedRow("c3", "Acme 2", 2)]);
    expect(slugs.get("c1")).toBe("acme");
    expect(slugs.get("c2")).toBeNull();
    expect(slugs.get("c3")).toBe("acme-2");
  });
});
