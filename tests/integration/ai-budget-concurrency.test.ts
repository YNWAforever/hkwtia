// @vitest-environment node
import {randomUUID,createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";
import {isolatedAuditDatabase} from "./audit-database-fixture";
import {
  createAiBudgetRepository,
  type AiBudgetLimits,
} from "@/lib/db/repos/ai-budget";
import {createAgentRuntime} from "@/lib/ai/runtime";
import {createAiOpsPublicRepository} from "@/lib/db/repos/aiops-public";
import {createAgentRunsRepository} from "@/lib/db/repos/agent-runs";
import type {AutomationDatabase} from "@/lib/db/repos/journeys";
let fixture: Awaited<ReturnType<typeof isolatedAuditDatabase>>;
const baseTime = new Date("2040-01-01T23:59:00Z");
let instant = baseTime;
const caps: AiBudgetLimits = {
  runMicrousd: 100,
  dayMicrousd: 500,
  monthMicrousd: 700,
};
const request = (cost = 100, scope = "concierge") => ({
  runKey: randomUUID(),
  scope,
  maxCostMicrousd: cost,
  expiresAt: new Date(instant.getTime() + 20_000).toISOString(),
});
const repo = (limits: AiBudgetLimits | null = caps) =>
  createAiBudgetRepository(
    async () => fixture.database as unknown as AutomationDatabase,
    () => limits,
    () => instant,
  );
async function reset() {
  await fixture.pool.query("TRUNCATE ai_budget_reservations CASCADE");
  await fixture.pool.query(
    "UPDATE ai_budget_control SET halted=false, reason_code=NULL",
  );
  instant = baseTime;
}
async function reserve(cost = 100) {
  const r = await repo().reserveAiBudget(request(cost));
  expect(r.ok).toBe(true);
  if (!r.ok) throw Error("EXPECTED_RESERVATION");
  return r.reservationId;
}
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== "1")(
  "AI budget actual PostgreSQL concurrency",
  () => {
    beforeAll(async () => {
      fixture = await isolatedAuditDatabase();
    }, 120000);
    afterAll(async () => {
      if (fixture) await fixture.close();
    });
    it("admits exactly five of twenty concurrent reservations without exceeding the daily cap", async () => {
      const results = await Promise.all(
        Array.from({length: 20}, () => repo().reserveAiBudget(request())),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(5);
      expect(results.filter((r) => !r.ok)).toHaveLength(15);
      expect(
        (
          await fixture.pool.query(
            "SELECT sum(charged_microusd)::text AS charged,count(*)::int AS count FROM ai_budget_reservations",
          )
        ).rows[0],
      ).toEqual({charged: "500", count: 5});
    }, 180000);
    it("same runKey concurrently creates one hold and a changed request is rejected", async () => {
      await reset();
      const input = request();
      const values = await Promise.all(
        Array.from({length: 20}, () => repo().reserveAiBudget(input)),
      );
      expect(
        new Set(values.map((r) => (r.ok ? r.reservationId : null))).size,
      ).toBe(1);
      expect(values.every((r) => r.ok)).toBe(true);
      expect(
        (
          await fixture.pool.query(
            "SELECT count(*)::int AS count FROM ai_budget_reservations",
          )
        ).rows[0].count,
      ).toBe(1);
      await expect(
        repo().reserveAiBudget({...input, scope: "judge"}),
      ).rejects.toThrow("AI_BUDGET_RUN_KEY_CONFLICT");
    });
    it("settles once, restores only known difference, and conflicting settlement cannot change the bill", async () => {
      await reset();
      const id = await reserve();
      await repo().markDispatched(id, "synthetic-provider-request");
      await Promise.all(
        Array.from({length: 20}, () =>
          repo().settleAiBudget({
            reservationId: id,
            usageState: "known",
            actualMicrousd: 20,
          }),
        ),
      );
      expect(
        (
          await fixture.pool.query(
            "SELECT charged_microusd::text AS charged,actual_microusd::text AS actual,usage_state,provider_request_id FROM ai_budget_reservations WHERE id=$1",
            [id],
          )
        ).rows[0],
      ).toEqual({
        charged: "20",
        actual: "20",
        usage_state: "known",
        provider_request_id: "synthetic-provider-request",
      });
      await expect(
        repo().settleAiBudget({
          reservationId: id,
          usageState: "known",
          actualMicrousd: 21,
        }),
      ).rejects.toThrow("AI_BUDGET_SETTLEMENT_CONFLICT");
    });
    it("unknown dispatch remains charged after TTL, date and month rollover; later reconciled usage releases the difference", async () => {
      await reset();
      const id = await reserve();
      await repo().markDispatched(id);
      await repo().settleAiBudget({
        reservationId: id,
        usageState: "unknown",
        actualMicrousd: null,
      });
      instant = new Date("2040-02-01T00:01:00Z");
      await expect(repo().releaseUndispatched(id)).rejects.toThrow(
        "AI_BUDGET_DISPATCH_ALREADY_STARTED",
      );
      const results = await Promise.all(
        Array.from({length: 6}, () => repo().reserveAiBudget(request())),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(4);
      expect(
        (
          await fixture.pool.query(
            "SELECT charged_microusd::text AS charged,usage_state FROM ai_budget_reservations WHERE id=$1",
            [id],
          )
        ).rows[0],
      ).toEqual({charged: "100", usage_state: "unknown"});
      await repo().settleAiBudget({
        reservationId: id,
        usageState: "known",
        actualMicrousd: 20,
      });
    });
    it("releases only a proven undispatched hold once; released runKey cannot become a new request", async () => {
      await reset();
      const input = request();
      const result = await repo().reserveAiBudget(input);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      await repo().releaseUndispatched(result.reservationId);
      await repo().releaseUndispatched(result.reservationId);
      expect(
        (
          await fixture.pool.query(
            "SELECT charged_microusd::text AS charged,usage_state FROM ai_budget_reservations",
          )
        ).rows[0],
      ).toEqual({charged: "0", usage_state: "released"});
      expect(await repo().reserveAiBudget(input)).toEqual({
        ok: false,
        reason: "BUDGET_EXCEEDED",
      });
    });
    it("enforces monthly and run caps across UTC days and every spending category", async () => {
      await reset();
      expect(await repo().reserveAiBudget(request(101))).toEqual({
        ok: false,
        reason: "BUDGET_EXCEEDED",
      });
      for (let i = 0; i < 5; i++) {
        const id = await reserve();
        await repo().markDispatched(id);
        await repo().settleAiBudget({
          reservationId: id,
          usageState: "known",
          actualMicrousd: 100,
        });
      }
      instant = new Date("2040-01-02T00:01:00Z");
      expect((await repo().reserveAiBudget(request(100, "embedding"))).ok).toBe(
        true,
      );
      expect(
        (await repo().reserveAiBudget(request(100, "evaluation"))).ok,
      ).toBe(true);
      expect(await repo().reserveAiBudget(request(1, "judge"))).toEqual({
        ok: false,
        reason: "BUDGET_EXCEEDED",
      });
    });
    it("records full provider overspend and halts all new work rather than truncating the actual cost", async () => {
      await reset();
      const id = await reserve();
      await repo().markDispatched(id);
      await repo().settleAiBudget({
        reservationId: id,
        usageState: "known",
        actualMicrousd: 150,
      });
      expect(
        (
          await fixture.pool.query(
            "SELECT actual_microusd::text AS actual,charged_microusd::text AS charged FROM ai_budget_reservations",
          )
        ).rows[0],
      ).toEqual({actual: "150", charged: "150"});
      expect(
        (
          await fixture.pool.query(
            "SELECT halted,reason_code FROM ai_budget_control",
          )
        ).rows[0],
      ).toEqual({halted: true, reason_code: "actual_exceeds_reservation"});
      expect(await repo().reserveAiBudget(request(1, "writer"))).toEqual({
        ok: false,
        reason: "BUDGET_EXCEEDED",
      });
    });
    it("does not record an unreported provider failure as a free completed bill", async () => {
      const runs = createAgentRunsRepository(
        async () => fixture.database as unknown as AutomationDatabase,
      );
      const actor = {
        kind: "agent",
        agent: "retention_analyst",
        runId: randomUUID(),
        conversationId: null,
        profileId: null,
        trigger: "scheduled",
      } as const;
      await runs.start(actor, {startedAt: baseTime});
      const failed = await runs.fail(actor, {
        completedAt: new Date(baseTime.getTime() + 1000),
        errorCode: "timeout",
      });
      expect(failed.costUsd).toBeNull();
      expect(
        (
          await fixture.pool.query(
            "SELECT cost_usd FROM agent_runs WHERE id=$1",
            [actor.runId],
          )
        ).rows[0].cost_usd,
      ).toBeNull();
    });
    it.each([
      "concierge",
      "writer",
      "retention_analyst",
      "board_reporter",
    ] as const)(
      "actual %s runtime/repository/SDK settles with a safe accepted-header receipt",
      async (agent) => {
        await reset();
        const runId = randomUUID();
        const runs = createAgentRunsRepository(
          async () => fixture.database as unknown as AutomationDatabase,
        );
        const budget = createAiBudgetRepository(
          async () => fixture.database as unknown as AutomationDatabase,
          () => ({
            runMicrousd: 2_000_000,
            dayMicrousd: 5_000_000,
            monthMicrousd: 10_000_000,
          }),
          () => instant,
        );
        const fetch = vi.fn(
          async () =>
            new Response(
              [
                {
                  type: "response.created",
                  response: {
                    id: "resp_synthetic",
                    created_at: 1,
                    model: "gpt-4.1-mini",
                  },
                },
                {
                  type: "response.output_item.added",
                  output_index: 0,
                  item: {type: "message", id: "msg_synthetic"},
                },
                {
                  type: "response.output_text.delta",
                  item_id: "msg_synthetic",
                  delta: "Synthetic draft only",
                },
                {
                  type: "response.output_item.done",
                  output_index: 0,
                  item: {type: "message", id: "msg_synthetic"},
                },
                {
                  type: "response.completed",
                  response: {usage: {input_tokens: 16, output_tokens: 8}},
                },
              ]
                .map((event) => "data: " + JSON.stringify(event) + "\n\n")
                .join(""),
              {
                headers: {
                  "content-type": "text/event-stream",
                  "x-request-id": "req_synthetic_" + agent,
                },
              },
            ),
        );
        vi.stubGlobal("fetch", fetch);
        try {
          let conversationId: string | null = null,
            profileId: string | null = null;
          if (agent === "concierge") {
            conversationId = randomUUID();
            await fixture.pool.query(
              "INSERT INTO conversations(id,locale,anonymous_owner_hash,expires_at) VALUES($1,'en',$2,'2040-02-01')",
              [conversationId, "synthetic-budget-owner-" + randomUUID()],
            );
          }
          if (agent === "writer") {
            profileId = "budget-writer-" + randomUUID();
            await fixture.pool.query(
              "INSERT INTO profiles(id,auth_user_id,display_name,email,role) VALUES($1,$1,'Synthetic budget Writer',$2,'member')",
              [profileId, profileId + "@example.test"],
            );
          }
          const runtime = createAgentRuntime({
            agentRuns: runs,
            budget,
            createRunId: () => runId,
            now: () => instant,
          });
          const actor =
            agent === "concierge"
              ? {
                  agent,
                  conversationId: conversationId!,
                  profileId: null,
                  trigger: "web" as const,
                }
              : agent === "writer"
                ? {
                    agent,
                    conversationId: null,
                    profileId: profileId!,
                    trigger: "portal" as const,
                  }
                : {
                    agent,
                    conversationId: null,
                    profileId: null,
                    trigger: "scheduled" as const,
                  };
          const reserved =
            agent === "writer"
              ? await runs.reserveWriterRun(
                  {kind: "member", profileId: profileId!, userId: profileId!},
                  {cap: 4, startedAt: instant},
                )
              : null;
          const stream = await runtime.stream({
            enabled: true,
            model: "openai:gpt-4.1-mini",
            credentials: {openaiApiKey: "synthetic-only"},
            actor,
            system: "Synthetic draft only",
            messages: [{role: "user", content: "Synthetic"}],
            tools: {},
            ...(reserved
              ? {preparedRun: runtime.adoptPrestarted(actor, reserved)}
              : {}),
          });
          const final = await stream.finish;
          expect(final.status).toBe("completed");
          expect(final.costUsd).toBe("0.000019");
          const recorded = (
            await fixture.pool.query(
              "SELECT usage_state,cost_microusd::text AS cost,pricing_version FROM agent_runs WHERE id=$1",
              [final.runId],
            )
          ).rows[0];
          expect(recorded).toEqual({
            usage_state: "known",
            cost: "19",
            pricing_version: "verified-2026-10-03",
          });
          const reservation = (
            await fixture.pool.query(
              "SELECT scope,usage_state,actual_microusd::text AS cost,accepted_at IS NOT NULL AS accepted,provider_request_id FROM ai_budget_reservations WHERE run_key=$1",
              [final.runId],
            )
          ).rows[0];
          expect(reservation).toEqual({
            scope:
              agent === "retention_analyst"
                ? "renewal"
                : agent === "board_reporter"
                  ? "board"
                  : agent,
            usage_state: "known",
            cost: "19",
            accepted: true,
            provider_request_id: "req_synthetic_" + agent,
          });
          expect(fetch).toHaveBeenCalledOnce();
        } finally {
          vi.unstubAllGlobals();
        }
      },
      180000,
    );
    it("stores the full safe micro-USD amount above the legacy decimal range", async () => {
      const runs = createAgentRunsRepository(
        async () => fixture.database as unknown as AutomationDatabase,
      );
      const actor = {
        kind: "agent",
        agent: "retention_analyst",
        runId: randomUUID(),
        conversationId: null,
        profileId: null,
        trigger: "scheduled",
      } as const;
      await runs.start(actor, {startedAt: baseTime});
      const done = await runs.finish(actor, {
        completedAt: baseTime,
        summaryCode: "answered",
        costUsd: "1000000.000001",
        usageState: "known",
      });
      expect(done.costUsd).toBe("1000000.000001");
      expect(
        (
          await fixture.pool.query(
            "SELECT cost_microusd::text AS exact,cost_usd FROM agent_runs WHERE id=$1",
            [actor.runId],
          )
        ).rows[0],
      ).toEqual({exact: "1000000000001", cost_usd: null});
    });
    it("public aggregate cost is unknown while an actual unresolved run exists", async () => {
      await reset();
      const at = new Date();
      const runs = createAgentRunsRepository(
        async () => fixture.database as unknown as AutomationDatabase,
      );
      const actor = {
        kind: "agent",
        agent: "retention_analyst",
        runId: randomUUID(),
        conversationId: null,
        profileId: null,
        trigger: "scheduled",
      } as const;
      await runs.start(actor, {startedAt: at});
      await runs.fail(actor, {completedAt: at, errorCode: "timeout"});
      const publicRepo = createAiOpsPublicRepository(
        async () => fixture.database as never,
      );
      const months = await publicRepo.readLatestTwelveMonths();
      expect(months.at(-1)!.llmCostUsd).toBeNull();
    });
    it("0057 applies forward with historical rows preserved and the ledger retained when new AI is disabled", async () => {
      const prior = await isolatedAuditDatabase(56);
      try {
        const id = randomUUID();
        await prior.pool.query(
          "INSERT INTO agent_runs(id,agent,trigger,status,input_tokens,output_tokens,cost_usd) VALUES($1,'retention_analyst','scheduled','completed',1000,500,0.0012)",
          [id],
        );
        const before = Number(
          (
            await prior.pool.query(
              "SELECT count(*) AS n FROM drizzle.__drizzle_migrations",
            )
          ).rows[0].n,
        );
        const journal=JSON.parse(readFileSync("drizzle/meta/_journal.json","utf8")) as {entries:{idx:number;tag:string}[]};
        expect(before).toBe(journal.entries.filter(entry=>entry.idx<=56).length);
        await prior.migrateRemaining();
        expect(
          Number(
            (
              await prior.pool.query(
                "SELECT count(*) AS n FROM drizzle.__drizzle_migrations",
              )
            ).rows[0].n,
          ),
        ).toBe(journal.entries.length);
        const expectedHashes=journal.entries.map(entry=>createHash('sha256').update(readFileSync('drizzle/'+entry.tag+'.sql','utf8')).digest('hex')).sort();
        expect((await prior.pool.query('SELECT hash FROM drizzle.__drizzle_migrations')).rows.map(row=>row.hash).sort()).toEqual(expectedHashes);
        expect(
          (
            await prior.pool.query(
              "SELECT input_tokens,output_tokens,cost_usd,usage_state,cost_microusd FROM agent_runs WHERE id=$1",
              [id],
            )
          ).rows[0],
        ).toEqual({
          input_tokens: 1000,
          output_tokens: 500,
          cost_usd: "0.001200",
          usage_state: "legacy_unknown",
          cost_microusd: null,
        });
        const database = prior.database as unknown as AutomationDatabase;
        const budget = createAiBudgetRepository(
          async () => database,
          () => caps,
          () => baseTime,
        );
        const result = await budget.reserveAiBudget({
          ...request(),
          expiresAt: new Date(baseTime.getTime() + 20000).toISOString(),
        });
        expect(result.ok).toBe(true);
        const runtime = createAgentRuntime({
          agentRuns: createAgentRunsRepository(async () => database),
          budget: createAiBudgetRepository(
            async () => database,
            () => null,
            () => baseTime,
          ),
          now: () => baseTime,
        });
        const disabled = await runtime.stream({
          enabled: false,
          model: "openai:gpt-4.1-mini",
          credentials: {},
          actor: {
            agent: "retention_analyst",
            trigger: "scheduled",
            conversationId: null,
            profileId: null,
          },
          system: "Synthetic",
          messages: [],
          tools: {},
        });
        expect((await disabled.finish).status).toBe("disabled");
        expect(
          (
            await prior.pool.query(
              "SELECT count(*)::int AS n FROM ai_budget_reservations",
            )
          ).rows[0].n,
        ).toBe(1);
      } finally {
        await prior.close();
      }
    }, 180000);
    it("missing/invalid caps fail closed and unsafe JSON amounts never reach SQL", async () => {
      await reset();
      expect(await repo(null).reserveAiBudget(request())).toEqual({
        ok: false,
        reason: "CONFIG_MISSING",
      });
      expect(
        await repo({...caps, dayMicrousd: NaN}).reserveAiBudget(request()),
      ).toEqual({ok: false, reason: "CONFIG_MISSING"});
      await expect(
        repo().reserveAiBudget(request(Number.MAX_SAFE_INTEGER + 1)),
      ).rejects.toThrow();
      await expect(
        repo().reserveAiBudget(request(1, "client-role-admin")),
      ).rejects.toThrow();
      expect(
        (
          await fixture.pool.query(
            "SELECT count(*)::int AS count FROM ai_budget_reservations",
          )
        ).rows[0].count,
      ).toBe(0);
    });
  },
);
