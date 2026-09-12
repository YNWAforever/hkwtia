import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import {segmentFilterSchema} from "@/lib/admin/segment-schema";
import {previewSegment, type SegmentReader} from "@/lib/admin/segments";
import {contactPredicates, memberPredicates, projectedAudience, segmentCursorClause} from "@/lib/db/repos/segments";
import type {AdminActor} from "@/lib/membership/lifecycle";

const actor: AdminActor = {kind: "staff", userId: "staff-1", profileId: "staff-1"};
const now = new Date("2026-09-11T00:00:00.000Z");
const eventId = "33333333-3333-4333-8333-333333333333";
const dialect = new PgDialect();

function renderMember(filter: Record<string, unknown>): string {
  return dialect.sqlToQuery(memberPredicates(segmentFilterSchema.parse(filter), now)).sql;
}

function renderContact(filter: Record<string, unknown>): string {
  return dialect.sqlToQuery(contactPredicates(segmentFilterSchema.parse(filter))).sql;
}

function renderAudience(filter: Record<string, unknown>): string {
  return dialect.sqlToQuery(projectedAudience(segmentFilterSchema.parse(filter), now)).sql;
}

describe("segment preview", () => {
  it("passes the exact corporate, below-20-score, renewal-within-60-days fixture to the shared reader", async () => {
    const calls: unknown[] = [];
    const reader: SegmentReader = {
      preview: async (_actor, filter, pagination) => {
        calls.push({filter, pagination});
        return {total: 1, items: [{kind: "member", id: "corporate-low-score", displayName: "Corporate Low Score", email: "member@example.test", companyName: "Acme", planCode: "corporate", membershipStatus: "active", renewalAt: "2026-09-01T00:00:00.000Z", score: 19, whatsappNumber: null, whatsappOptIn: false, contactStage: null, contactSource: null}], nextCursor: null};
      },
    };

    const preview = await previewSegment(actor, {filter: {profileIds: ["corporate-low-score"], tier: ["corporate"], scoreMax: 19.99, renewalWithinDays: 60}, limit: "25", cursor: null}, reader);

    expect(preview.items.map((item) => item.id)).toEqual(["corporate-low-score"]);
    expect(calls).toEqual([{
      filter: {profileIds: ["corporate-low-score"], tier: ["corporate"], status: [], scoreMin: null, scoreMax: 19.99, renewalWithinDays: 60, sector: "", lastLoginBeforeDays: null, whatsappOptIn: null, industryTags: [], companyPlan: [], event: null, audience: "members", contactStage: [], contactSource: []},
      pagination: {limit: 25, cursor: null},
    }]);
  });

  it("rejects an invalid filter before the reader can run", async () => {
    const reader: SegmentReader = {preview: async () => { throw new Error("PRIVATE_READ"); }};

    await expect(previewSegment(actor, {filter: {unknown: "value"}}, reader)).rejects.toThrow();
  });
});

describe("segment predicates v1.5 (Phase A, F11)", () => {
  it("filters on whatsapp opt-in only when the tri-state is set", () => {
    const set = dialect.sqlToQuery(memberPredicates(segmentFilterSchema.parse({whatsappOptIn: true}), now));
    expect(set.sql).toContain("whatsapp_opt_in");
    expect(set.params).toContain(true);
    expect(renderMember({})).not.toContain("whatsapp_opt_in");
  });

  it("takes its renewal and last-login windows from the caller's snapshot, never from the clock", () => {
    // `preview` builds the projection once and executes it twice, so a
    // `new Date()` inside the predicate builder let `total` and the page
    // disagree, and let CSV pages drift as the window slid between them.
    const set = dialect.sqlToQuery(memberPredicates(segmentFilterSchema.parse({renewalWithinDays: 10, lastLoginBeforeDays: 30}), now));
    expect(set.params).toContainEqual(now);
    expect(set.params).toContainEqual(new Date(now.getTime() + 10 * 86_400_000));
    expect(set.params).toContainEqual(new Date(now.getTime() - 30 * 86_400_000));
  });
});

describe("segment predicates v2 (C-6)", () => {
  it("compiles industryTags to the companies.tags array containment and never to the sector ILIKE", () => {
    const tags = renderMember({industryTags: ["ai", "fintech"]});
    expect(tags).toContain('"companies"."tags" @> ARRAY[');
    expect(tags).toContain("::text[]");
    expect(tags).not.toContain("ILIKE");

    // `sector` is a different column with different semantics, and stays put.
    const sector = renderMember({sector: "logistics"});
    expect(sector).toContain('"companies"."industry" ILIKE');
    expect(sector).not.toContain("@>");
  });

  it("rejects an industry tag outside the closed vocabulary", () => {
    expect(() => segmentFilterSchema.parse({industryTags: ["not-a-slug"]})).toThrow();
  });

  it("distinguishes companyPlan from tier by requiring a company-held membership", () => {
    const companyPlan = renderMember({companyPlan: ["corporate"]});
    expect(companyPlan).toContain('"memberships"."plan_code" IN (');
    expect(companyPlan).toContain('"memberships"."company_id" IS NOT NULL');
    expect(renderMember({tier: ["corporate"]})).not.toContain('"memberships"."company_id" IS NOT NULL');
  });

  it("compiles a member event state to a parenthesised EXISTS over event_registrations", () => {
    const attended = renderMember({event: {eventId, state: "attended"}});
    expect(attended).toContain('EXISTS (SELECT 1 FROM "event_registrations"');
    expect(attended).not.toContain("NOT EXISTS");
    expect(attended).toContain('"event_registrations"."profile_id" = "profiles"."id"');
  });

  it("compiles not_registered to a NOT EXISTS whose subquery names only the attending states", () => {
    const notRegistered = renderMember({event: {eventId, state: "not_registered"}});
    expect(notRegistered).toContain('NOT EXISTS (SELECT 1 FROM "event_registrations"');
    expect(notRegistered).toContain('"event_registrations"."status" IN (');
    for (const [, following] of notRegistered.matchAll(/\bexists\b\s*(.)/gi)) expect(following).toBe("(");
    expect(notRegistered.split("(").length).toBe(notRegistered.split(")").length);
  });

  it("points the contact arm at event_guest_registrations, never at the member registrations", () => {
    const guest = renderContact({audience: "contacts", event: {eventId, state: "registered"}});
    expect(guest).toContain('EXISTS (SELECT 1 FROM "event_guest_registrations"');
    expect(guest).toContain('"event_guest_registrations"."contact_id" = "contacts"."id"');
    expect(guest).not.toContain('"event_registrations".');
  });

  it("links a guest registration to its contact by email, the only link the RSVP flow writes", () => {
    // `event_guest_registrations.contact_id` exists but no writer populates it:
    // the single INSERT in lib/db/repos/event-guests.ts names ten columns and
    // that is not one of them, and no migration backfills it. Keyed on that
    // column alone the arm was inert in the direction that sends mail — every
    // row NULL, so NOT EXISTS was always true and a prospect who had just
    // RSVP'd to the event was invited again, while every positive state matched
    // nobody. The RSVP writes the registration and upserts the contact from the
    // same lowercased email, so that is the link the predicate has to use.
    for (const state of ["registered", "attended", "not_registered"]) {
      const guest = renderContact({audience: "contacts", event: {eventId, state}});
      expect(guest).toContain('lower("event_guest_registrations"."email") = lower("contacts"."email")');
      expect(guest).toContain('"event_guest_registrations"."contact_id" = "contacts"."id"');
      expect(guest.split("(").length).toBe(guest.split(")").length);
    }
  });

  it("compiles the contact stage and source vocabularies against contacts", () => {
    const contact = renderContact({audience: "contacts", contactStage: ["qualified"], contactSource: ["whatsapp"], whatsappOptIn: true});
    expect(contact).toContain('"contacts"."stage" IN (');
    expect(contact).toContain('"contacts"."source" IN (');
    expect(contact).toContain('"contacts"."whatsapp_opt_in" =');
  });

  it("matches no contact at all when the filter demands a membership a prospect cannot have", () => {
    // Ignoring a membership-shaped term on the contact arm would return every
    // prospect for a segment that asked for corporate members — the audience
    // would be wrong in the direction that sends marketing to strangers.
    expect(renderContact({audience: "contacts", tier: ["corporate"]})).toBe("FALSE");
    expect(renderContact({audience: "contacts", scoreMin: 10})).toBe("FALSE");
    expect(renderContact({audience: "contacts", renewalWithinDays: 30})).toBe("FALSE");
    expect(renderContact({audience: "contacts", companyPlan: ["patron"]})).toBe("FALSE");
  });

  it("matches no member at all when the filter demands a contact stage or source a profile cannot have", () => {
    // The mirror of the rule above, and the more dangerous half. A profile has
    // no funnel stage and no acquisition source, so dropping the two terms left
    // the member arm with ZERO terms and it fell through to TRUE — every
    // profile on the site, for a segment named after a prospect stage. The
    // queue shortcut only refuses `audience: "contacts"`, so "both" walked past
    // that guard and snapshotted the whole membership onto campaign_recipients.
    expect(renderMember({audience: "both", contactStage: ["qualified"]})).toBe("FALSE");
    expect(renderMember({audience: "members", contactSource: ["whatsapp"]})).toBe("FALSE");
    expect(renderMember({audience: "both", contactStage: ["new"], tier: ["corporate"]})).toBe("FALSE");
    // The guard fires on the contact-shaped terms only; an ordinary member
    // filter still compiles to its own predicates.
    expect(renderMember({tier: ["corporate"]})).toContain('"memberships"."plan_code" IN (');
  });
});

describe("segment audience projection (C-6, S-10)", () => {
  it("reads only contacts when the audience is contacts", () => {
    const contactsOnly = renderAudience({audience: "contacts"});
    expect(contactsOnly).toContain('FROM "contacts"');
    expect(contactsOnly).not.toContain('"profiles"');
    expect(contactsOnly).not.toContain("UNION ALL");
  });

  it("reads only profiles when the audience is members", () => {
    const membersOnly = renderAudience({audience: "members"});
    expect(membersOnly).toContain('FROM "profiles"');
    expect(membersOnly).not.toContain('FROM "contacts"');
    expect(membersOnly).not.toContain("UNION ALL");
  });

  it("unions both arms with a discriminating kind when the audience is both", () => {
    const both = renderAudience({audience: "both"});
    expect(both).toContain("UNION ALL");
    expect(both).toContain("'member'::text AS \"kind\"");
    expect(both).toContain("'contact'::text AS \"kind\"");
    expect(both.split("(").length).toBe(both.split(")").length);
  });

  it("keeps the member arm of a both-audience union empty when the filter is contact-shaped", () => {
    // The union still carries both arms — `audience` decides that, and it says
    // "both" — but the member arm selects nobody, so the preview shows the
    // qualified prospects the staff member meant and not every profile beside
    // them.
    const both = renderAudience({audience: "both", contactStage: ["qualified"]});
    expect(both).toContain("UNION ALL");
    expect(both).toContain("WHERE FALSE");
    expect(both).toContain('"contacts"."stage" IN (');
  });

  it("parenthesises the keyset cursor predicate so a second WHERE term cannot swallow its OR", () => {
    const cursor = Buffer.from(JSON.stringify({sortKey: "ada", kind: "member", id: "profile-1"}), "utf8").toString("base64url");
    const clause = dialect.sqlToQuery(segmentCursorClause(cursor)).sql;

    expect(clause.startsWith("(")).toBe(true);
    expect(clause.endsWith(")")).toBe(true);
    expect(clause).toContain('("kind", "id") > (');
    expect(clause.split("(").length).toBe(clause.split(")").length);
    expect(dialect.sqlToQuery(segmentCursorClause(null)).sql).toBe("TRUE");
  });

  it("refuses a cursor that is not the three-part v2 shape", () => {
    const legacy = Buffer.from(JSON.stringify({displayName: "ada", profileId: "profile-1"}), "utf8").toString("base64url");
    expect(() => segmentCursorClause(legacy)).toThrow();
  });
});
