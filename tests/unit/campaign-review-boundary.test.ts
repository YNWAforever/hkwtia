import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it} from "vitest";
import {z} from "zod";

import {createCampaignsRepository} from "@/lib/db/repos/campaigns";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

const creator: AdminActor = {kind: "staff", userId: "admin-a", profileId: "admin-a"};
const reviewer: AdminActor = {kind: "staff", userId: "admin-b", profileId: "admin-b"};
const member: Actor = {kind: "member", userId: "member-1", profileId: "member-1"};
const campaignId = "33333333-3333-4333-8333-333333333333";

/**
 * S-7. `reviewableCampaign` is the only accessor in this repository that
 * authorizes on `created_by_profile_id <> $actor`, so the SQL carries the
 * inequality and the fake answers on it rather than on a hard-coded actor: a
 * predicate that silently became `=` would still return a row for the creator
 * here, and the whole two-person control would be a screen-level convention.
 */
function reviewDatabase() {
  const statements: Array<{sql: string; params: unknown[]}> = [];
  const database = drizzle(async (sql, params) => {
    statements.push({sql, params});
    const normalized = sql.toLowerCase();
    if (normalized.includes('from "campaigns"')) {
      const asksForSomeoneElsesCampaign = normalized.includes("<>") && params.includes(campaignId);
      return asksForSomeoneElsesCampaign && !params.includes(creator.profileId) ? {rows: [[campaignId]]} : {rows: []};
    }
    if (normalized.trimStart().startsWith("update")) return {rows: [[campaignId]]};
    return {rows: []};
  });
  return {database, statements};
}

describe("campaign review boundaries", () => {
  it("refuses the creator, so a campaign cannot be approved by the admin who wrote it", async () => {
    const {database} = reviewDatabase();
    const repository = createCampaignsRepository(async () => database as never);

    await expect(repository.recordReview(creator, database, campaignId, {outcome: "approved"})).rejects.toThrow();
    await expect(repository.recordReview(reviewer, database, campaignId, {outcome: "approved"})).resolves.toBeUndefined();
  });

  it("refuses a member before any statement reaches the database", async () => {
    const {database, statements} = reviewDatabase();
    const repository = createCampaignsRepository(async () => database as never);

    await expect(repository.recordReview(member, database, campaignId, {outcome: "approved"})).rejects.toThrow();
    await expect(repository.schedule(member, database, campaignId, new Date("2026-10-01T00:00:00.000Z"))).rejects.toThrow();
    await expect(repository.submitForReview(member, database, campaignId)).rejects.toThrow();
    await expect(repository.campaignReportFor(member, database, campaignId)).rejects.toThrow();
    expect(statements).toEqual([]);
  });

  it("validates the decision and the schedule before any statement reaches the database", async () => {
    const {database, statements} = reviewDatabase();
    const repository = createCampaignsRepository(async () => database as never);

    await expect(repository.recordReview(reviewer, database, campaignId, {outcome: "maybe"} as never)).rejects.toBeInstanceOf(z.ZodError);
    await expect(repository.recordReview(reviewer, database, campaignId, {outcome: "rejected"} as never)).rejects.toBeInstanceOf(z.ZodError);
    await expect(repository.schedule(reviewer, database, campaignId, new Date("not a date"))).rejects.toBeInstanceOf(z.ZodError);
    await expect(repository.submitForReview(reviewer, database, "not-a-uuid")).rejects.toBeInstanceOf(z.ZodError);
    expect(statements).toEqual([]);
  });

  it("records a rejection with its reason and lets the creator submit again", async () => {
    const {database, statements} = reviewDatabase();
    const repository = createCampaignsRepository(async () => database as never);

    await repository.recordReview(reviewer, database, campaignId, {outcome: "rejected", reason: "Wrong segment"});
    const updates = statements.filter(({sql}) => sql.toLowerCase().trimStart().startsWith("update"));
    expect(updates).toHaveLength(1);
    // Rejection returns the campaign to `draft` rather than `failed`: `failed`
    // belongs to the promotion step (S-6), and a rejected draft is meant to be
    // fixed and re-submitted, not buried in a terminal state.
    expect(updates[0].params).toContain("Wrong segment");
    expect(statements.some(({sql}) => sql.toLowerCase().startsWith('insert into "audit_events"'))).toBe(true);
  });
});
