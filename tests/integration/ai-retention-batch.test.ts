// @vitest-environment node
import {
  beforeAll,
  beforeEach,
  afterAll,
  it,
  expect,
  describe,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { createDraftWorkRepository } from "@/lib/db/repos/ai-draft-work";
import type { KbDatabaseLoader } from "@/lib/db/repos/kb-documents";
import { createAgentRuntime } from "@/lib/ai/runtime";
import { createAgentRunsRepository } from "@/lib/db/repos/agent-runs";
import { createApprovalsRepository } from "@/lib/db/repos/approvals";
import { createAiBudgetRepository } from "@/lib/db/repos/ai-budget";
import type { Database } from "@/lib/db/repos/common";
import type { AgentProviderFactory } from "@/lib/ai/provider";
import {
  runRetentionAnalyst,
  type RetentionAnalystServiceDependencies,
} from "@/lib/ai/retention-analyst/service";
import { runScheduledJson, type AgentConfig } from "@/lib/ai/scheduled-runtime";
import { PgDialect } from "drizzle-orm/pg-core";
import { isolatedAuditDatabase } from "@/tests/integration/audit-database-fixture";
import { createRetentionAnalystRepository } from "@/lib/db/repos/retention-analyst";
import { automationCronActor } from "@/lib/auth/automation-actor";
import type { AutomationDatabase } from "@/lib/db/repos/journeys";
let f: Awaited<ReturnType<typeof isolatedAuditDatabase>>;
const asOf = new Date("2027-06-01T00:00:00.000Z");
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== "1")(
  "T11 bounded SQL retention candidate reads using actual all60-migration PostgreSQL",
  () => {
    beforeAll(async () => {
      f = await isolatedAuditDatabase();
    }, 120000);
    beforeEach(async () => {
      await f.pool.query(
        "TRUNCATE profiles,ai_draft_work,agent_runs,ai_budget_reservations CASCADE",
      );
    });
    async function seed(count: number) {
      await f.pool.query(
        "INSERT INTO profiles(id,auth_user_id,display_name,email,locale,created_at) SELECT 't11-'||lpad(n::text,6,'0'),'t11-auth-'||n,'Synthetic retention', 'retention-'||n||'@example.test','en',$1 FROM generate_series(1,$2::int)n",
        [new Date(asOf.getTime() - 86400000), count],
      );
      await f.pool.query(
        "INSERT INTO memberships(id,owner_user_id,plan_code,status,seat_limit,billing_period_end,created_at) SELECT gen_random_uuid(),id,'startup','active',1,$1,$2 FROM profiles WHERE id LIKE 't11-%'",
        [
          new Date(asOf.getTime() + 86400000 * 30),
          new Date(asOf.getTime() - 86400000),
        ],
      );
    }
    afterAll(async () => {
      if (f) await f.close();
    });
    it("never transfers more than101 candidate rows from a database query while preserving all1000 in the compatibility facade", async () => {
      await seed(1000);
      const transferred: number[] = [];
      const database = {
        execute: async (
          query: Parameters<AutomationDatabase["execute"]>[0],
        ) => {
          const result = await f.database.execute(query);
          transferred.push(result.rows.length);
          return result;
        },
      } as unknown as AutomationDatabase;
      const repo = createRetentionAnalystRepository(async () => database);
      const candidates = await repo.listCandidates(automationCronActor(), {
        asOf,
      });
      expect(candidates).toHaveLength(1000);
      expect(Math.max(...transferred)).toBeLessThanOrEqual(101);
    });
    it.each([1000, 10000])(
      "preserves all %i unique profiles in stable keyset pages, bounded queries and a real execution plan",
      async (count) => {
        await seed(count);
        const transferred: number[] = [];
        let firstQuery:
          Parameters<AutomationDatabase["execute"]>[0] | undefined;
        const database = {
          execute: async (
            query: Parameters<AutomationDatabase["execute"]>[0],
          ) => {
            firstQuery ??= query;
            const result = await f.database.execute(query);
            transferred.push(result.rows.length);
            return result;
          },
        } as unknown as AutomationDatabase;
        const repo = createRetentionAnalystRepository(async () => database);
        const ids: string[] = [];
        let cursor: string | null = null;
        do {
          const page = await repo.listCandidatePage(automationCronActor(), {
            asOf,
            cursor,
            limit: 100,
          });
          ids.push(...page.items.map((c) => c.profileId));
          cursor = page.nextCursor;
        } while (cursor);
        expect(ids).toHaveLength(count);
        expect(new Set(ids).size).toBe(count);
        expect(ids).toEqual([...ids].sort());
        expect(transferred).toHaveLength(count / 100);
        expect(Math.max(...transferred)).toBeLessThanOrEqual(101);
        const compiled = new PgDialect().sqlToQuery(firstQuery!);
        const explained = await f.pool.query(
          "EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) " + compiled.sql,
          compiled.params,
        );
        const plan = explained.rows[0]["QUERY PLAN"][0];
        expect(plan.Plan["Node Type"]).toBe("Limit");
        expect(plan.Plan["Actual Rows"]).toBeLessThanOrEqual(101);
        console.info(
          JSON.stringify({
            fixture: "synthetic-loopback-pg16",
            count,
            queries: transferred.length,
            maxRows: Math.max(...transferred),
            executionMs: plan["Execution Time"],
            planningMs: plan["Planning Time"],
          }),
        );
      },
      30000,
    );
    it("binds the cursor to asOf and excludes new profiles, new memberships and future company seats", async () => {
      await seed(3);
      const repo = createRetentionAnalystRepository(
        async () => f.database as unknown as AutomationDatabase,
      );
      const first = await repo.listCandidatePage(automationCronActor(), {
        asOf,
        limit: 1,
      });
      expect(first.items[0].profileId).toBe("t11-000001");
      await expect(
        repo.listCandidatePage(automationCronActor(), {
          asOf: new Date(asOf.getTime() + 1),
          cursor: first.nextCursor,
          limit: 1,
        }),
      ).rejects.toThrow();
      await f.pool.query("UPDATE profiles SET created_at=$1 WHERE id=$2", [
        new Date(asOf.getTime() + 1),
        "t11-000002",
      ]);
      await f.pool.query(
        "UPDATE memberships SET created_at=$1 WHERE owner_user_id=$2",
        [new Date(asOf.getTime() + 1), "t11-000003"],
      );
      const companyId = randomUUID();
      await f.pool.query(
        "INSERT INTO companies(id,legal_name,display_name) VALUES($1,'Synthetic company','Synthetic company')",
        [companyId],
      );
      await f.pool.query(
        "INSERT INTO memberships(company_id,plan_code,status,seat_limit,billing_period_end,created_at) VALUES($1,'corporate','active',5,$2,$3)",
        [
          companyId,
          new Date(asOf.getTime() + 86400000 * 30),
          new Date(asOf.getTime() - 86400000),
        ],
      );
      await f.pool.query(
        "INSERT INTO company_members(company_id,user_id,role,joined_at) VALUES($1,'t11-000003','member',$2)",
        [companyId, new Date(asOf.getTime() + 1)],
      );
      const remaining = await repo.listCandidatePage(automationCronActor(), {
        asOf,
        cursor: first.nextCursor,
      });
      expect(remaining.items).toEqual([]);
    });
    it("reads existing pending drafts in the same candidate query and preserves past_due risk eligibility", async () => {
      await seed(2);
      await f.pool.query(
        "UPDATE memberships SET status='past_due' WHERE owner_user_id='t11-000001'",
      );
      await f.pool.query(
        "INSERT INTO approvals(action_type,payload,status) VALUES('agent.retention_outreach',$1::jsonb,'pending')",
        [JSON.stringify({ profileId: "t11-000001" })],
      );
      let queries = 0;
      const database = {
        execute: async (q: Parameters<AutomationDatabase["execute"]>[0]) => {
          queries++;
          return f.database.execute(q);
        },
      } as unknown as AutomationDatabase;
      const page = await createRetentionAnalystRepository(
        async () => database,
      ).listCandidatePage(automationCronActor(), { asOf });
      expect(page.items.map((x) => [x.profileId, x.pending])).toEqual([
        ["t11-000001", true],
        ["t11-000002", false],
      ]);
      expect(queries).toBe(1);
    });

    it("records a real renewal approval as the fenced durable result and reuses it after restart and the next day", async () => {
      const runClock = { at: new Date("2027-06-01T00:00:00Z") };
      const work = createDraftWorkRepository(
        (async () => f.database) as KbDatabaseLoader,
        () => runClock.at,
        5,
      );
      const key = {
        kind: "renewal",
        caseId: randomUUID(),
        factsHash: "a".repeat(64),
        agentVersion: "retention-v2",
        idempotencyKey: "synthetic-" + randomUUID(),
      };
      const claims = await Promise.all([
        work.claimDraftWork(key),
        work.claimDraftWork(key),
      ]);
      expect(claims.map((c) => c.disposition).sort()).toEqual([
        "busy",
        "claimed",
      ]);
      const claim = claims.find((c) => c.disposition === "claimed")!;
      await work.markDraftRequestStarted({
        runId: claim.runId,
        claimToken: claim.claimToken,
      });
      await work.recordDraftProviderReceipt({
        runId: claim.runId,
        claimToken: claim.claimToken,
        providerRequestId: "synthetic-accepted",
      });
      const approvalId = randomUUID();
      await f.pool.query(
        "INSERT INTO approvals(id,action_type,request_key,payload,status) VALUES($1,'agent.retention_outreach',$2,$3::jsonb,'pending')",
        [
          approvalId,
          key.idempotencyKey,
          JSON.stringify({
            profileId: key.caseId,
            agentRunId: claim.runId,
            factsHash: key.factsHash,
          }),
        ],
      );
      await work.finishDraftWork({
        runId: claim.runId,
        claimToken: claim.claimToken,
        state: "succeeded",
        draftId: null,
        approvalId,
        providerRequestId: "synthetic-accepted",
      });
      runClock.at = new Date("2027-06-02T00:00:00Z");
      expect(await work.claimDraftWork(key)).toMatchObject({
        runId: claim.runId,
        disposition: "reuse",
        draftId: null,
        approvalId,
      });
      const row = (
        await f.pool.query(
          "SELECT state,approval_id FROM ai_draft_work WHERE run_id=$1",
          [claim.runId],
        )
      ).rows[0];
      expect(row).toEqual({ state: "succeeded", approval_id: approvalId });
    });

    function realService(
      mode:
        | "success"
        | "accepted-timeout"
        | "changed-after-receipt"
        | "withdraw-before-dispatch"
        | "missing-budget" = "success",
    ) {
      const clock = { at: new Date(asOf) };
      const loader = async () => f.database as unknown as AutomationDatabase;
      const work = createDraftWorkRepository(
        (async () => f.database) as KbDatabaseLoader,
        () => clock.at,
        5,
      );
      const candidates = createRetentionAnalystRepository(loader),
        runs = createAgentRunsRepository(loader);
      const approvals = createApprovalsRepository(
        async () => f.database as unknown as Database,
        () => clock.at,
      );
      const budget = createAiBudgetRepository(
        loader,
        () =>
          mode === "missing-budget"
            ? null
            : {
                runMicrousd: 2_000_000,
                dayMicrousd: 5_000_000,
                monthMicrousd: 10_000_000,
              },
        () => clock.at,
      );
      const providerCalls = vi.fn();
      const provider: AgentProviderFactory = () => ({
        stream: async (request) => {
          providerCalls();
          await request.onProviderReceipt?.(
            "synthetic-receipt-" + randomUUID(),
          );
          if (mode === "accepted-timeout")
            throw Error("SYNTHETIC_ACCEPTED_TIMEOUT");
          if (mode === "changed-after-receipt")
            await f.pool.query(
              "UPDATE memberships SET billing_period_end=$1 WHERE owner_user_id=$2",
              [new Date(asOf.getTime() + 365 * 86400000), "t11-000001"],
            );
          const output = {
            subject: "Can we help?",
            body: "Please contact our team to discuss your membership.\n{{facts.renewalDate}}",
            reasonCodes: ["inactive_before_renewal"],
          };
          return {
            textStream: {
              async *[Symbol.asyncIterator]() {
                yield JSON.stringify(output);
              },
            },
            finish: Promise.resolve({
              usage: { inputTokens: 100, outputTokens: 40 },
              steps: 1,
              toolExecutions: 0,
              finishReason: "stop",
              citations: [],
            }),
          };
        },
      });
      const agentConfig: AgentConfig = {
        enabled: true,
        model: "openai:gpt-4.1-mini",
        credentials: { openaiApiKey: "synthetic-offline-provider" },
        system: "Draft only from synthetic approved facts.",
        runtime: createAgentRuntime({
          agentRuns: runs,
          budget,
          providerFactories: { openai: provider, anthropic: provider },
          now: () => clock.at,
        }),
      };
      const dependencies = {
        work,
        candidates: {
          ...candidates,
          getCurrentCandidate: async (
            ...args: Parameters<typeof candidates.getCurrentCandidate>
          ) => {
            if (mode === "withdraw-before-dispatch")
              await f.pool.query(
                "UPDATE profiles SET consent_marketing=false WHERE id='t11-000001'",
              );
            return candidates.getCurrentCandidate(...args);
          },
        },
        approvals,
        agentRuns: runs,
        runJson: (
          input: Parameters<RetentionAnalystServiceDependencies["runJson"]>[0],
        ) => runScheduledJson(input),
        createRunId: randomUUID,
      };
      // The runtime, transactions, budget, work and approval repositories are real.
      // Only this named provider is synthetic; this is not external model acceptance.
      const run = (at = clock.at) =>
        runRetentionAnalyst(
          automationCronActor(),
          { asOf: at, agentConfig },
          dependencies as Parameters<typeof runRetentionAnalyst>[2],
        );
      return { clock, work, candidates, approvals, providerCalls, run };
    }
    it("runs two real repository/runtime workers once, settles actual synthetic usage and reuses a completed approval across days", async () => {
      await seed(1);
      const service = realService();
      const results = await Promise.all([service.run(), service.run()]);
      expect(results.reduce((n, r) => n + r.drafted, 0)).toBe(1);
      expect(service.providerCalls).toHaveBeenCalledTimes(1);
      const saved = (
        await f.pool.query(
          "SELECT * FROM approvals WHERE action_type='agent.retention_outreach'",
        )
      ).rows;
      expect(saved).toHaveLength(1);
      expect(saved[0].payload.body).toContain("2027-07-01");
      expect(
        (await f.pool.query("SELECT state,approval_id FROM ai_draft_work"))
          .rows,
      ).toEqual([{ state: "succeeded", approval_id: saved[0].id }]);
      expect(
        (
          await f.pool.query(
            "SELECT usage_state,actual_microusd::text AS cost FROM ai_budget_reservations",
          )
        ).rows,
      ).toEqual([{ usage_state: "known", cost: "104" }]);
      await f.pool.query("UPDATE approvals SET status='rejected' WHERE id=$1", [
        saved[0].id,
      ]);
      service.clock.at = new Date("2027-06-02T00:00:00Z");
      expect((await service.run()).deduplicated).toBe(1);
      expect(service.providerCalls).toHaveBeenCalledTimes(1);
    });
    it("holds accepted-timeout work and budget across restart, lease expiry, next day and changed facts", async () => {
      await seed(1);
      const service = realService("accepted-timeout");
      await expect(service.run()).rejects.toThrow(
        "RETENTION_ANALYST_CANDIDATE_FAILED",
      );
      expect(service.providerCalls).toHaveBeenCalledTimes(1);
      const before = (
        await f.pool.query(
          "SELECT charged_microusd::text AS charged,usage_state FROM ai_budget_reservations",
        )
      ).rows[0];
      expect(before.usage_state).toBe("unknown");
      expect(Number(before.charged)).toBeGreaterThan(0);
      service.clock.at = new Date("2027-06-02T00:00:00Z");
      await f.pool.query(
        "UPDATE profiles SET locale='zh-HK' WHERE id='t11-000001'",
      );
      await expect(service.run()).rejects.toThrow(
        "RETENTION_ANALYST_CANDIDATE_FAILED",
      );
      expect(service.providerCalls).toHaveBeenCalledTimes(1);
      expect(
        (
          await f.pool.query(
            "SELECT charged_microusd::text AS charged,usage_state FROM ai_budget_reservations",
          )
        ).rows,
      ).toEqual([before]);
      expect(
        (await f.pool.query("SELECT state FROM ai_draft_work")).rows,
      ).toEqual([{ state: "unknown" }]);
    });
    it.each([
      "changed-after-receipt",
      "withdraw-before-dispatch",
      "missing-budget",
    ] as const)(
      "fails closed for %s without creating an approval or an outbound message",
      async (mode) => {
        await seed(1);
        await f.pool.query(
          "UPDATE profiles SET consent_marketing=true WHERE id='t11-000001'",
        );
        const service = realService(mode);
        await expect(service.run()).rejects.toThrow(
          "RETENTION_ANALYST_CANDIDATE_FAILED",
        );
        expect(service.providerCalls).toHaveBeenCalledTimes(
          mode === "changed-after-receipt" ? 1 : 0,
        );
        expect(
          (await f.pool.query("SELECT count(*)::int AS count FROM approvals"))
            .rows[0].count,
        ).toBe(0);
        expect(
          (
            await f.pool.query(
              "SELECT count(*)::int AS count FROM messages WHERE direction='outbound'",
            )
          ).rows[0].count,
        ).toBe(0);
        if (mode === "withdraw-before-dispatch")
          expect(
            (
              await f.pool.query(
                "SELECT usage_state,charged_microusd::text AS charged FROM ai_budget_reservations",
              )
            ).rows,
          ).toEqual([{ usage_state: "released", charged: "0" }]);
      },
    );
    it("does not draft an already renewed member and rejects a reviewed approval after consent changes", async () => {
      await seed(1);
      const service = realService();
      await service.run();
      const approval = (
        await f.pool.query(
          "SELECT id FROM approvals WHERE action_type='agent.retention_outreach'",
        )
      ).rows[0];
      await f.pool.query(
        "INSERT INTO profiles(id,auth_user_id,display_name,email,role) VALUES('t11-staff','t11-staff-auth','Synthetic staff','staff-t11@example.test','staff')",
      );
      await f.pool.query(
        "UPDATE profiles SET whatsapp_opt_in=true WHERE id='t11-000001'",
      );
      await expect(
        service.approvals.decide(
          { kind: "staff", profileId: "t11-staff", userId: "t11-staff-auth" },
          { approvalId: approval.id, decision: "approved" },
        ),
      ).rejects.toThrow("APPROVAL_FACTS_STALE");
      expect(
        (
          await f.pool.query("SELECT status FROM approvals WHERE id=$1", [
            approval.id,
          ])
        ).rows[0].status,
      ).toBe("pending");
      await f.pool.query(
        "UPDATE memberships SET billing_period_end=$1 WHERE owner_user_id=$2",
        [new Date(asOf.getTime() + 365 * 86400000), "t11-000001"],
      );
      expect((await service.run()).considered).toBe(0);
      expect(service.providerCalls).toHaveBeenCalledTimes(1);
    });

    it("chooses one earliest membership per profile across direct ownership and company seats, with revoked seats excluded", async () => {
      await seed(2);
      const companyId = randomUUID(),
        membershipId = randomUUID();
      await f.pool.query(
        "INSERT INTO companies(id,legal_name,display_name) VALUES($1,'Synthetic company','Synthetic company')",
        [companyId],
      );
      await f.pool.query(
        "INSERT INTO memberships(id,company_id,plan_code,status,seat_limit,billing_period_end,created_at) VALUES($1,$2,'corporate','active',5,$3,$4)",
        [
          membershipId,
          companyId,
          new Date(asOf.getTime() + 20 * 86400000),
          new Date(asOf.getTime() - 86400000),
        ],
      );
      await f.pool.query(
        "INSERT INTO company_members(company_id,user_id,role,joined_at) VALUES($1,'t11-000001','member',$2),($1,'t11-000002','member',$2)",
        [companyId, new Date(asOf.getTime() - 86400000)],
      );
      const repo = createRetentionAnalystRepository(
        async () => f.database as unknown as AutomationDatabase,
      );
      expect(
        (
          await repo.listCandidatePage(automationCronActor(), { asOf })
        ).items.map((c) => [c.profileId, c.membershipId]),
      ).toEqual([
        ["t11-000001", membershipId],
        ["t11-000002", membershipId],
      ]);
      await f.pool.query(
        "UPDATE company_members SET revoked_at=$1 WHERE user_id='t11-000001'",
        [asOf],
      );
      const page = await repo.listCandidatePage(automationCronActor(), {
        asOf,
      });
      expect(page.items).toHaveLength(2);
      expect(page.items[0].membershipId).not.toBe(membershipId);
      expect(page.items[1].membershipId).toBe(membershipId);
    });
    it("refuses an approval result belonging to another case, facts version, runtime or idempotency key", async () => {
      const work = createDraftWorkRepository(
          (async () => f.database) as KbDatabaseLoader,
          () => asOf,
          5,
        ),
        key = {
          kind: "renewal",
          caseId: randomUUID(),
          factsHash: "a".repeat(64),
          agentVersion: "v2",
          idempotencyKey: "t11-" + randomUUID(),
        };
      const claim = await work.claimDraftWork(key);
      await work.markDraftRequestStarted({
        runId: claim.runId,
        claimToken: claim.claimToken,
      });
      await work.recordDraftProviderReceipt({
        runId: claim.runId,
        claimToken: claim.claimToken,
        providerRequestId: "synthetic-request",
      });
      const approvalId = randomUUID();
      await f.pool.query(
        "INSERT INTO approvals(id,action_type,request_key,payload,status) VALUES($1,'agent.retention_outreach',$2,$3::jsonb,'pending')",
        [
          approvalId,
          "wrong-key",
          JSON.stringify({
            profileId: "wrong-case",
            agentRunId: randomUUID(),
            factsHash: "b".repeat(64),
          }),
        ],
      );
      await expect(
        work.finishDraftWork({
          runId: claim.runId,
          claimToken: claim.claimToken,
          state: "succeeded",
          draftId: null,
          approvalId,
          providerRequestId: "synthetic-request",
        }),
      ).rejects.toThrow("DRAFT_WORK_RESULT_INVALID");
      expect(
        (
          await f.pool.query(
            "SELECT state,approval_id FROM ai_draft_work WHERE run_id=$1",
            [claim.runId],
          )
        ).rows[0],
      ).toEqual({ state: "requesting", approval_id: null });
    });

    it("uses database group ordering for mixed-case profile IDs so cursors cannot duplicate or omit a group", async () => {
      for (const id of ["t11-Z", "t11-a", "t11-z"]) {
        await f.pool.query(
          "INSERT INTO profiles(id,auth_user_id,display_name,email,created_at) VALUES($1,$1,'Synthetic profile',$2,$3)",
          [id, id + "@example.test", new Date(asOf.getTime() - 86400000)],
        );
        await f.pool.query(
          "INSERT INTO memberships(owner_user_id,plan_code,status,seat_limit,billing_period_end,created_at) VALUES($1,'startup','active',1,$2,$3)",
          [
            id,
            new Date(asOf.getTime() + 30 * 86400000),
            new Date(asOf.getTime() - 86400000),
          ],
        );
      }
      const expected = (
        await f.pool.query("SELECT id FROM profiles ORDER BY id")
      ).rows.map((r) => r.id);
      const repo = createRetentionAnalystRepository(
          async () => f.database as unknown as AutomationDatabase,
        ),
        first = await repo.listCandidatePage(automationCronActor(), {
          asOf,
          limit: 2,
        }),
        last = await repo.listCandidatePage(automationCronActor(), {
          asOf,
          limit: 2,
          cursor: first.nextCursor,
        });
      expect([...first.items, ...last.items].map((r) => r.profileId)).toEqual(
        expected,
      );
      expect(last.nextCursor).toBeNull();
    });
  },
);
