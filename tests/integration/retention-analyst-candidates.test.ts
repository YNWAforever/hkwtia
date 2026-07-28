import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it, vi} from "vitest";

import {automationCronActor} from "@/lib/auth/automation-actor";
import {
  createRetentionAnalystRepository,
} from "@/lib/db/repos/retention-analyst";
import type {AutomationDatabase} from "@/lib/db/repos/journeys";

const asOf = new Date("2027-04-01T00:00:00.000Z");

function normalizedSql(statement: string | undefined): string {
  return (statement ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

describe("retention analyst candidate repository", () => {
  it("selects only privacy-minimized fields and returns deterministic at-risk candidates", async () => {
    const statements: string[] = [];
    const database = drizzle(async (query) => {
      statements.push(query);
      return {
        rows: [
          {
            profile_id: "profile-z",
            membership_id: "22222222-2222-4222-8222-222222222222",
            locale: "en",
            plan_code: "corporate",
            status: "active",
            renewal_at: new Date("2027-04-20T00:00:00.000Z"),
            score: "50",
            trend: "0",
            last_login_at: new Date("2026-01-01T00:00:00.000Z"),
          },
          {
            profile_id: "profile-a",
            membership_id: "11111111-1111-4111-8111-111111111111",
            locale: "unsupported",
            plan_code: "startup",
            status: "past_due",
            renewal_at: new Date("2027-10-01T00:00:00.000Z"),
            score: "10",
            trend: "-2",
            last_login_at: new Date("2027-03-20T00:00:00.000Z"),
          },
        ],
      };
    });
    const repository = createRetentionAnalystRepository(
      async () => database as unknown as AutomationDatabase,
    );

    await expect(repository.listCandidates(automationCronActor(), {asOf})).resolves.toEqual([
      {
        profileId: "profile-a",
        membershipId: "11111111-1111-4111-8111-111111111111",
        locale: "zh-HK",
        planCode: "startup",
        renewalDate: "2027-10-01",
        score: 10,
        trend: "down",
        riskCodes: ["low_score_declining"],
      },
      {
        profileId: "profile-z",
        membershipId: "22222222-2222-4222-8222-222222222222",
        locale: "en",
        planCode: "corporate",
        renewalDate: "2027-04-20",
        score: 50,
        trend: "flat",
        riskCodes: ["inactive_before_renewal"],
      },
    ]);

    expect(statements).toHaveLength(1);
    const statement = normalizedSql(statements[0]);
    expect(statement).toContain('"profiles"."locale"');
    expect(statement).toContain('"engagement_scores"."score"');
    expect(statement).toContain('"engagement_scores"."trend"');
    expect(statement).not.toMatch(/\b(email|phone|display_name|auth_user_id|whatsapp_number)\b/);
    expect(statement).toMatch(/order by .*profiles.*id.*memberships.*id/);
  });

  it("authorizes the automation cron before database access", async () => {
    const loadDatabase = vi.fn();
    const repository = createRetentionAnalystRepository(loadDatabase);

    await expect(repository.listCandidates(
      {kind: "staff", userId: "staff", profileId: "staff"} as never,
      {asOf},
    )).rejects.toThrow("FORBIDDEN");
    await expect(repository.listCandidates(
      {kind: "system", userId: null, source: "stripe-webhook"},
      {asOf},
    )).rejects.toThrow("FORBIDDEN");
    expect(loadDatabase).not.toHaveBeenCalled();
  });
});
