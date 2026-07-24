import {getTableConfig} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import {
  approvals,
  campaigns,
  campaignRecipients,
  emailLog,
  engagementEvents,
  engagementScores,
  eventRegistrations,
  events,
  memberNotes,
  memberships,
  profiles,
  savedSegments,
} from "@/lib/db/schema-core";

const names = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table).columns.map((column) => column.name);

describe("M2 schema contract", () => {
  it("adds staff identity fields without replacing the M1 profile key", () => {
    expect(names(profiles)).toEqual(expect.arrayContaining([
      "id", "auth_user_id", "email", "role", "last_login_at",
      "consent_marketing", "interests",
    ]));
  });

  it("exports every Admin CRM table", () => {
    expect([
      engagementEvents, engagementScores, memberNotes, emailLog,
      savedSegments, campaigns, campaignRecipients, events,
      eventRegistrations, approvals,
    ].map((table) => getTableConfig(table).name)).toEqual([
      "engagement_events", "engagement_scores", "member_notes", "email_log",
      "saved_segments", "campaigns", "campaign_recipients", "events",
      "event_registrations", "approvals",
    ]);
  });

  it("models note replacement integrity and the renewal-window index", () => {
    const noteConfig = getTableConfig(memberNotes);
    const membershipConfig = getTableConfig(memberships);
    const replacement = noteConfig.foreignKeys.find((foreignKey) => foreignKey.getName() === "member_notes_replaces_note_id_member_notes_id_fk");

    expect(replacement).toBeDefined();
    expect(replacement?.reference().columns.map((column) => column.name)).toEqual(["replaces_note_id"]);
    expect(replacement?.reference().foreignColumns.map((column) => column.name)).toEqual(["id"]);
    expect(replacement?.onDelete).toBe("set null");
    expect(membershipConfig.indexes.map((index) => index.config.name)).toContain("memberships_billing_period_end_idx");
  });
});
