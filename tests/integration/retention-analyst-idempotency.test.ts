import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it, vi} from "vitest";

import type {ScheduledAgentActor} from "@/lib/auth/agent-actor";
import {automationCronActor} from "@/lib/auth/automation-actor";
import {createApprovalsRepository} from "@/lib/db/repos/approvals";

const actor: ScheduledAgentActor = {
  kind: "agent",
  agent: "retention_analyst",
  runId: "11111111-1111-4111-8111-111111111111",
  conversationId: null,
  profileId: null,
  trigger: "scheduled",
};
const input = {
  requestKey: "retention:2027-04-01:profile-a:retention-analyst-v1",
  profileId: "profile-a",
  membershipId: "22222222-2222-4222-8222-222222222222",
  locale: "en" as const,
  reasonCodes: ["inactive_before_renewal"] as ("inactive_before_renewal")[],
  subject: "Membership renewal",
  body: "Hello {{first_name}}, your membership renews on {{renewal_date}}.",
};

function normalizedSql(statement: string | undefined): string {
  return (statement ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

describe("retention outreach approval idempotency", () => {
  it("creates one pending approval and recovers the concurrent request-key winner", async () => {
    const statements: Array<{sql: string; params: unknown[]}> = [];
    let call = 0;
    const database = drizzle(async (query, params) => {
      statements.push({sql: query, params});
      call += 1;
      const currentCall = call;
      await Promise.resolve();
      return {
        rows: [{
          approval_id: "33333333-3333-4333-8333-333333333333",
          created: currentCall === 1,
        }],
      };
    });
    const repository = createApprovalsRepository(async () => database as never);

    const results = await Promise.all([
      repository.createRetentionOutreachOnce(actor, input),
      repository.createRetentionOutreachOnce(actor, input),
    ]);

    expect(results).toEqual([
      {approvalId: "33333333-3333-4333-8333-333333333333", created: true},
      {approvalId: "33333333-3333-4333-8333-333333333333", created: false},
    ]);
    expect(statements).toHaveLength(2);
    for (const statement of statements) {
      const sql = normalizedSql(statement.sql);
      expect(sql).toMatch(/insert into "approvals"/);
      expect(sql).toMatch(/on conflict.*request_key.*do update.*request_key/);
      expect(sql).toContain("requested_by_profile_id");
      expect(sql).toContain("null");
      expect(statement.params).toEqual(expect.arrayContaining([
        "agent.retention_outreach",
        input.requestKey,
        "pending",
        actor.runId,
        input.profileId,
        input.membershipId,
      ]));
      expect(JSON.stringify(statement.params)).not.toMatch(/email|phone/i);
      expect(sql).not.toMatch(/email_log|delivery|queue|send/);
    }
  });

  it("rejects the wrong scheduled identity before database access", async () => {
    const loadDatabase = vi.fn();
    const repository = createApprovalsRepository(loadDatabase);

    await expect(repository.createRetentionOutreachOnce(
      {...actor, agent: "board_reporter"},
      input,
    )).rejects.toThrow("FORBIDDEN");
    await expect(repository.createRetentionOutreachOnce(
      {kind: "staff"} as never,
      input,
    )).rejects.toThrow("FORBIDDEN");
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("detects a pending retention outreach before model execution", async () => {
    const statements: string[] = [];
    const database = drizzle(async (query) => {
      statements.push(query);
      return {rows: [{pending: true}]};
    });
    const repository = createApprovalsRepository(async () => database as never);

    await expect(repository.hasPendingRetentionOutreach(
      automationCronActor(),
      "profile-a",
    )).resolves.toBe(true);

    const sql = normalizedSql(statements[0]);
    expect(sql).toContain('"approvals"');
    expect(sql).toContain("agent.retention_outreach");
    expect(sql).toContain("pending");
    expect(sql).toMatch(/payload.*profileid/);

    const loadDatabase = vi.fn();
    const deniedRepository = createApprovalsRepository(loadDatabase);
    await expect(deniedRepository.hasPendingRetentionOutreach(
      {kind: "staff", userId: "staff", profileId: "staff"} as never,
      "profile-a",
    )).rejects.toThrow("FORBIDDEN");
    expect(loadDatabase).not.toHaveBeenCalled();
  });
});
