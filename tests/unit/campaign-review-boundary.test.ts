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

/**
 * `reviewDatabase` deliberately answers nothing to `ownedCampaign`, because its
 * subject is the reviewer accessor. The review LIFECYCLE crosses both
 * accessors — the creator submits, a second admin decides — so it needs a fake
 * that answers each on its own predicate: `<>` is `reviewableCampaign`, `=` is
 * `ownedCampaign`. Answering both on a hard-coded actor instead would let a
 * predicate that flipped to `=` still pass.
 */
function lifecycleDatabase() {
  const statements: Array<{sql: string; params: unknown[]}> = [];
  const database = drizzle(async (sql, params) => {
    statements.push({sql, params});
    const normalized = sql.toLowerCase();
    if (normalized.includes('from "campaigns"')) {
      if (!params.includes(campaignId)) return {rows: []};
      const asksForSomeoneElsesCampaign = normalized.includes("<>");
      const isCreator = params.includes(creator.profileId);
      return asksForSomeoneElsesCampaign === isCreator ? {rows: []} : {rows: [[campaignId]]};
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

  it("clears the review stamp on a resubmission, so a rejection cannot stand in for an approval", async () => {
    const {database, statements} = lifecycleDatabase();
    const repository = createCampaignsRepository(async () => database as never);

    await repository.recordReview(reviewer, database, campaignId, {outcome: "rejected", reason: "Wrong segment"});
    await repository.submitForReview(creator, database, campaignId);

    const updates = statements.filter(({sql}) => sql.toLowerCase().trimStart().startsWith("update"));
    expect(updates).toHaveLength(2);
    // A rejection HAS to stamp the reviewer: they are who the audit trail is
    // about.
    expect(updates[0].sql.toLowerCase()).toContain("reviewed_at = now()");
    // Which is exactly why the resubmission has to unstamp it. `schedule`
    // reads approval off the row as `status = 'review' AND reviewed_at IS NOT
    // NULL`, so a resubmitted draft that kept the rejection's stamp was
    // byte-identical to an approved one: any non-creator admin could schedule
    // the blast, no `campaign.review.approved` row would exist, and
    // `reviewed_by_profile_id` would durably credit the sign-off to the admin
    // who had refused it.
    const resubmission = updates[1].sql.toLowerCase();
    expect(resubmission).toContain("status = 'review'");
    expect(resubmission).toContain("reviewed_at = null");
    expect(resubmission).toContain("reviewed_by_profile_id = null");
    expect(resubmission).toContain("rejection_reason = null");
  });

  it("schedules only a campaign that carries a review stamp", async () => {
    const {database, statements} = lifecycleDatabase();
    const repository = createCampaignsRepository(async () => database as never);

    await repository.schedule(reviewer, database, campaignId, new Date("2026-10-01T00:00:00.000Z"));

    // The other half of the invariant the test above pins. Both halves are one
    // rule; neither is safe to change alone.
    const update = statements.find(({sql}) => sql.toLowerCase().trimStart().startsWith("update"));
    expect(update?.sql.toLowerCase()).toContain("target.status = 'review'");
    expect(update?.sql.toLowerCase()).toContain("target.reviewed_at is not null");
  });

  it("reports a send-time suppression as not sent, not as an unaccounted recipient", async () => {
    const repository = createCampaignsRepository(async () => ({}) as never);
    // The shape `campaignReportFor`'s GROUP BY produces. Two ways of not
    // sending to somebody: blocked at snapshot time, which names an eligibility
    // category in `blocked_reason`, and refused at SEND time, which
    // `markRecipientSuppressed` writes as `status = 'suppressed'` with an
    // `error_code` and a NULL `blocked_reason`. Folding on `blocked_reason`
    // alone put the second kind in `total` and in no other bucket — 23
    // recipients, 18 sent, 3 not sent, two people missing from the report, and
    // those two are consent refusals.
    const store = {
      async execute() {
        return {
          rows: [
            {status: "sent", blockedReason: null, errorCode: null, count: 18, delivered: 17, read: 5},
            {status: "suppressed", blockedReason: "not_opted_in", errorCode: null, count: 3, delivered: 0, read: 0},
            {status: "suppressed", blockedReason: null, errorCode: "marketing_suppressed", count: 2, delivered: 0, read: 0},
          ],
        };
      },
    };

    const report = await repository.campaignReportFor(reviewer, store, campaignId);

    expect(report.total).toBe(23);
    expect(report.sent).toBe(18);
    expect(report.blocked).toBe(5);
    expect(report.byReason).toEqual({not_opted_in: 3, marketing_suppressed: 2});
  });
});
