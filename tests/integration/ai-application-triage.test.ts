// @vitest-environment node
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { isolatedAuditDatabase } from "./audit-database-fixture";
import { createApplicationDraftAdoptionService } from "@/lib/admin/application-case-service";
import { createApplicationCasesRepository } from "@/lib/db/repos/applications";
import { readApprovedDraftFacts } from "@/lib/ai/drafts/case-facts";
import { createDraftGenerationService } from "@/lib/ai/drafts/generation";
import { createAgentRunsRepository } from "@/lib/db/repos/agent-runs";
import { createAiBudgetRepository } from "@/lib/db/repos/ai-budget";
import { createAgentRuntime } from "@/lib/ai/runtime";
import { createAdminModelRegistry } from "@/lib/ai/providers/registry";
import type { AutomationDatabase } from "@/lib/db/repos/journeys";
import type { AgentProviderFactory } from "@/lib/ai/provider";
import { createDraftWorkRepository } from "@/lib/db/repos/ai-draft-work";
import { createAiDraftsRepository } from "@/lib/db/repos/ai-drafts";
import type { Database } from "@/lib/db/repos/common";
const staff = {
    kind: "staff",
    profileId: "t09-staff",
    userId: "t09-auth-staff",
  } as const,
  app = randomUUID(),
  member = "t09-member",
  company = randomUUID(),
  membership = randomUUID();
let fixture: Awaited<ReturnType<typeof isolatedAuditDatabase>>,
  repo: ReturnType<typeof createApplicationCasesRepository>;
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== "1")(
  "actual isolated application triage",
  () => {
    beforeAll(async () => {
      fixture = await isolatedAuditDatabase();
      repo = createApplicationCasesRepository(
        async () => fixture.database as unknown as Database,
      );
      await fixture.pool.query(
        "INSERT INTO profiles(id,auth_user_id,email,display_name,role,locale) VALUES('t09-staff','t09-auth-staff','staff@t09.example.test','Synthetic staff','staff','en'),('t09-member','t09-auth-member','member@t09.example.test','Synthetic member','member','zh-HK')",
      );
      await fixture.pool.query(
        "INSERT INTO companies(id,legal_name,display_name) VALUES($1,'Synthetic Limited','Synthetic')",
        [company],
      );
      await fixture.pool.query(
        "INSERT INTO membership_applications(id,applicant_user_id,company_id,plan_code,status) VALUES($1,$2,$3,'corporate','pending_payment')",
        [app, member, company],
      );
      await fixture.pool.query(
        "INSERT INTO memberships(id,company_id,application_id,plan_code,status,seat_limit) VALUES($1,$2,$3,'corporate','pending_payment',25)",
        [membership, company, app],
      );
    }, 60000);
    afterAll(async () => {
      if (fixture) await fixture.close();
    }, 60000);
    it("reads actual required-field rules without changing membership, billing, tasks or audit", async () => {
      const before = (
        await fixture.pool.query(
          "SELECT (SELECT count(*) FROM memberships) AS memberships,(SELECT count(*) FROM billing_attempts) AS attempts,(SELECT count(*) FROM staff_tasks) AS tasks,(SELECT count(*) FROM audit_events) AS audit",
        )
      ).rows;
      const result = await repo.getApplicationTriage(staff, app);
      expect(result).toMatchObject({
        locale: "zh-HK",
        caseVersion: "0",
        triage: {
          missingFields: [],
          nextActionCode: "await_payment",
          paymentDisposition: "processing_or_unconfirmed",
        },
      });
      expect(JSON.stringify(result)).not.toContain("Synthetic member");
      expect(JSON.stringify(result)).not.toContain("member@t09.example.test");
      expect(
        (
          await fixture.pool.query(
            "SELECT (SELECT count(*) FROM memberships) AS memberships,(SELECT count(*) FROM billing_attempts) AS attempts,(SELECT count(*) FROM staff_tasks) AS tasks,(SELECT count(*) FROM audit_events) AS audit",
          )
        ).rows,
      ).toEqual(before);
    });
    it("changed authoritative fields change the source hash and expose only actual required missing fields", async () => {
      const before = await repo.getApplicationTriage(staff, app);
      await fixture.pool.query(
        "UPDATE profiles SET display_name='' WHERE id=$1",
        [member],
      );
      try {
        const after = await repo.getApplicationTriage(staff, app);
        expect(after).toMatchObject({
          triage: {
            missingFields: ["displayName"],
            nextActionCode: "await_payment",
          },
        });
        expect(after?.factsHash).not.toBe(before?.factsHash);
      } finally {
        await fixture.pool.query(
          "UPDATE profiles SET display_name='Synthetic member' WHERE id=$1",
          [member],
        );
      }
    });
    it("checks current trusted auth identity and role before returning application facts", async () => {
      await expect(
        repo.getApplicationTriage({ ...staff, userId: "wrong-auth" }, app),
      ).rejects.toThrow("FORBIDDEN");
      await fixture.pool.query(
        "UPDATE profiles SET role='member' WHERE id=$1",
        [staff.profileId],
      );
      try {
        await expect(repo.getApplicationTriage(staff, app)).rejects.toThrow(
          "FORBIDDEN",
        );
      } finally {
        await fixture.pool.query(
          "UPDATE profiles SET role='staff' WHERE id=$1",
          [staff.profileId],
        );
      }
    });
    it("returns missing distinctly and denies a member before a source read", async () => {
      expect(await repo.getApplicationTriage(staff, randomUUID())).toBeNull();
      await expect(
        repo.getApplicationTriage(
          { kind: "member", profileId: member, userId: "t09-auth-member" },
          app,
        ),
      ).rejects.toThrow("FORBIDDEN");
    });
    it("registers authoritative application facts and revalidates an approved draft after source changes", async () => {
      const facts = await fixture.database.transaction((tx) =>
        readApprovedDraftFacts(
          staff,
          { kind: "application", caseId: app, asOf: new Date() },
          tx,
        ),
      );
      expect(facts.locale).toBe("zh-HK");
      expect(facts.values.applicationState.value).toBe("待付款");
      expect(JSON.stringify(facts)).not.toContain("Synthetic member");
      expect(JSON.stringify(facts)).not.toContain("member@t09.example.test");
      const runId = randomUUID();
      await fixture.pool.query(
        "INSERT INTO agent_runs(id,agent,trigger,status,provider,model,usage_state) VALUES($1,'board_reporter','scheduled','completed','synthetic-fixture','t09-no-provider','legacy_unknown')",
        [runId],
      );
      const drafts = createAiDraftsRepository(
        async () => fixture.database as never,
      );
      const draft = await drafts.saveProposedDraft(staff, {
        kind: "application",
        caseId: app,
        body: "{{facts.applicationState}}",
        claims: [
          {
            field: "applicationState",
            value: facts.values.applicationState.value,
            sourceId: "db:application:" + app,
          },
        ],
        sourceRefs: [],
        ownerId: null,
        dueAt: null,
        modelRoute: "synthetic-fixture-no-provider",
        promptVersion: "t09-test-v1",
        runId,
      });
      expect(draft.state).toBe("needs_review");
      await drafts.reviewDraft(staff, {
        draftId: draft.id,
        expectedVersion: 1,
        decision: "approve",
      });
      await fixture.pool.query(
        "UPDATE profiles SET display_name='Changed synthetic name' WHERE id=$1",
        [member],
      );
      try {
        const after = await drafts.getDraft(staff, draft.id);
        expect(after?.draft.state).toBe("stale");
        expect(after?.draft.version).toBe(3);
      } finally {
        await fixture.pool.query(
          "UPDATE profiles SET display_name='Synthetic member' WHERE id=$1",
          [member],
        );
      }
    });
    it("a facts change during generation is stale instead of silently rebasing the model response", async () => {
      const facts = await fixture.database.transaction((tx) =>
          readApprovedDraftFacts(
            staff,
            { kind: "application", caseId: app, asOf: new Date() },
            tx,
          ),
        ),
        runId = randomUUID();
      await fixture.pool.query(
        "INSERT INTO agent_runs(id,agent,trigger,status,provider,model,usage_state) VALUES($1,'board_reporter','scheduled','completed','synthetic-fixture','t09-no-provider','legacy_unknown')",
        [runId],
      );
      await fixture.pool.query(
        "UPDATE profiles SET display_name='Changed while generating' WHERE id=$1",
        [member],
      );
      try {
        const drafts = createAiDraftsRepository(
          async () => fixture.database as never,
        );
        const draft = await drafts.saveProposedDraft(staff, {
          kind: "application",
          caseId: app,
          body: "{{facts.applicationState}}",
          claims: [
            {
              field: "applicationState",
              value: facts.values.applicationState.value,
              sourceId: "db:application:" + app,
            },
          ],
          sourceRefs: [],
          ownerId: null,
          dueAt: null,
          modelRoute: "synthetic-fixture-no-provider",
          promptVersion: "t09-test-v1",
          runId,
          expectedFactsHash: facts.versionHash,
        });
        expect(draft.state).toBe("stale");
        expect(draft.factsHash).toBe(facts.versionHash);
        expect((await drafts.getDraft(staff, draft.id))?.renderedBody).toBe("");
      } finally {
        await fixture.pool.query(
          "UPDATE profiles SET display_name='Synthetic member' WHERE id=$1",
          [member],
        );
      }
    });
    it("unknown effect cannot be bypassed by changing facts hash and request key", async () => {
      const work = createDraftWorkRepository(
          async () => fixture.database as never,
        ),
        caseId = randomUUID(),
        base = {
          kind: "application",
          caseId,
          agentVersion: "t09-test",
          factsHash: "c".repeat(64),
          idempotencyKey: "original",
        },
        first = await work.claimDraftWork(base),
        token = { runId: first.runId, claimToken: first.claimToken };
      await work.markDraftRequestStarted(token);
      await work.finishDraftWork({
        ...token,
        state: "unknown",
        draftId: null,
        providerRequestId: "synthetic-known-receipt",
      });
      const changed = await work.claimDraftWork({
        ...base,
        factsHash: "d".repeat(64),
        idempotencyKey: "changed",
      });
      expect(changed.disposition).toBe("unknown");
      expect(changed.runId).toBe(first.runId);
      expect(
        (
          await fixture.pool.query(
            "SELECT count(*)::int AS count FROM ai_draft_work WHERE case_id=$1",
            [caseId],
          )
        ).rows[0].count,
      ).toBe(1);
    });
    it("stores the provider receipt before body/save and refuses rebinding", async () => {
      const work = createDraftWorkRepository(
          async () => fixture.database as never,
        ),
        first = await work.claimDraftWork({
          kind: "application",
          caseId: randomUUID(),
          agentVersion: "t09-test",
          factsHash: "e".repeat(64),
          idempotencyKey: "receipt",
        }),
        token = { runId: first.runId, claimToken: first.claimToken };
      await work.markDraftRequestStarted(token);
      await work.recordDraftProviderReceipt({
        ...token,
        providerRequestId: "synthetic-request-a",
      });
      expect(
        (
          await fixture.pool.query(
            "SELECT state,provider_request_id FROM ai_draft_work WHERE run_id=$1",
            [first.runId],
          )
        ).rows[0],
      ).toEqual({
        state: "requesting",
        provider_request_id: "synthetic-request-a",
      });
      await expect(
        work.recordDraftProviderReceipt({
          ...token,
          providerRequestId: "synthetic-request-b",
        }),
      ).rejects.toThrow("DRAFT_WORK_RECEIPT_CONFLICT");
    });
    it("real repository/runtime/budget generation stores one fact-bound review draft and reuses it", async () => {
      let calls = 0;
      const base = createAdminModelRegistry(),
        registry = {
          ...base,
          application: { ...base.application, approvedForAdmin: true },
        },
        drafts = createAiDraftsRepository(
          async () => fixture.database as never,
        ),
        work = createDraftWorkRepository(async () => fixture.database as never),
        runs = createAgentRunsRepository(
          async () => fixture.database as unknown as AutomationDatabase,
        ),
        budget = createAiBudgetRepository(
          async () => fixture.database as unknown as AutomationDatabase,
          () => ({
            runMicrousd: 1000000,
            dayMicrousd: 10000000,
            monthMicrousd: 10000000,
          }),
        );
      const provider: AgentProviderFactory = () => ({
        stream: async (input) => {
          calls++;
          await input.onProviderReceipt?.("synthetic-t09-success");
          return {
            textStream: {
              async *[Symbol.asyncIterator]() {
                yield JSON.stringify({
                  body: "{{facts.applicationState}}\n{{facts.paymentFollowUp}}",
                });
              },
            },
            finish: Promise.resolve({
              usage: { inputTokens: 10, outputTokens: 10 },
              steps: 1,
              toolExecutions: 0,
              finishReason: "stop",
              citations: [],
            }),
          };
        },
      });
      const service = createDraftGenerationService({
        kind: "application",
        promptVersion: "t09-isolated-v1",
        drafts,
        work,
        configuration: () => ({
          enabled: true,
          model: registry.application.key,
          registry,
          credentials: { openaiApiKey: "synthetic-test-key" },
        }),
        runtime: (runId) =>
          createAgentRuntime({
            agentRuns: runs,
            budget,
            administrativeTask: "application",
            modelRegistry: registry,
            createRunId: () => runId,
            providerFactories: { openai: provider, anthropic: provider },
          }),
      });
      const before = (
        await fixture.pool.query(
          "SELECT (SELECT count(*) FROM messages) AS messages,(SELECT count(*) FROM memberships) AS memberships,(SELECT count(*) FROM billing_attempts) AS attempts",
        )
      ).rows;
      const draft = await service.prepareDraft(staff, app);
      expect(draft.state).toBe("needs_review");
      expect((await service.prepareDraft(staff, app)).id).toBe(draft.id);
      expect(calls).toBe(1);
      expect(
        (
          await fixture.pool.query(
            "SELECT scope,usage_state,provider_request_id FROM ai_budget_reservations WHERE run_key=$1",
            [draft.runId],
          )
        ).rows[0],
      ).toMatchObject({
        scope: "application",
        usage_state: "known",
        provider_request_id: "synthetic-t09-success",
      });
      expect(
        (
          await fixture.pool.query(
            "SELECT state,provider_request_id FROM ai_draft_work WHERE run_id=$1",
            [draft.runId],
          )
        ).rows[0],
      ).toMatchObject({
        state: "succeeded",
        provider_request_id: "synthetic-t09-success",
      });
      expect(
        (
          await fixture.pool.query(
            "SELECT (SELECT count(*) FROM messages) AS messages,(SELECT count(*) FROM memberships) AS memberships,(SELECT count(*) FROM billing_attempts) AS attempts",
          )
        ).rows,
      ).toEqual(before);
    });
    it("accepted simulated provider timeout keeps actual liability and blocks a changed-facts replacement request", async () => {
      const caseId = randomUUID();
      await fixture.pool.query(
        "INSERT INTO membership_applications(id,applicant_user_id,plan_code,status) VALUES($1,$2,'community','draft')",
        [caseId, member],
      );
      let calls = 0;
      const base = createAdminModelRegistry(),
        registry = {
          ...base,
          application: { ...base.application, approvedForAdmin: true },
        },
        drafts = createAiDraftsRepository(
          async () => fixture.database as never,
        ),
        work = createDraftWorkRepository(async () => fixture.database as never),
        runs = createAgentRunsRepository(
          async () => fixture.database as unknown as AutomationDatabase,
        ),
        budget = createAiBudgetRepository(
          async () => fixture.database as unknown as AutomationDatabase,
          () => ({
            runMicrousd: 1000000,
            dayMicrousd: 10000000,
            monthMicrousd: 10000000,
          }),
        );
      const provider: AgentProviderFactory = () => ({
        stream: async (input) => {
          calls++;
          await input.onProviderReceipt?.("synthetic-t09-timeout");
          throw Error("synthetic accepted timeout");
        },
      });
      const service = createDraftGenerationService({
        kind: "application",
        promptVersion: "t09-isolated-v1",
        drafts,
        work,
        configuration: () => ({
          enabled: true,
          model: registry.application.key,
          registry,
          credentials: { openaiApiKey: "synthetic-test-key" },
        }),
        runtime: (runId) =>
          createAgentRuntime({
            agentRuns: runs,
            budget,
            administrativeTask: "application",
            modelRegistry: registry,
            createRunId: () => runId,
            providerFactories: { openai: provider, anthropic: provider },
          }),
      });
      await expect(service.prepareDraft(staff, caseId)).rejects.toThrow();
      expect(calls).toBe(1);
      await fixture.pool.query(
        "UPDATE profiles SET display_name='Changed after timeout' WHERE id=$1",
        [member],
      );
      try {
        await expect(service.prepareDraft(staff, caseId)).rejects.toThrow(
          "DRAFT_GENERATION_UNKNOWN_EFFECT",
        );
        expect(calls).toBe(1);
      } finally {
        await fixture.pool.query(
          "UPDATE profiles SET display_name='Synthetic member' WHERE id=$1",
          [member],
        );
      }
      const state = (
        await fixture.pool.query(
          "SELECT w.state,b.usage_state,b.charged_microusd::int AS cost,w.provider_request_id FROM ai_draft_work w JOIN ai_budget_reservations b ON b.run_key=w.run_id WHERE w.case_id=$1",
          [caseId],
        )
      ).rows[0];
      expect(state).toMatchObject({
        state: "unknown",
        usage_state: "unknown",
        provider_request_id: "synthetic-t09-timeout",
      });
      expect(state.cost).toBeGreaterThan(0);
    });
    it("recovers a proven undispatched budget failure with a fresh run while retaining its failed run history", async () => {
      const caseId = randomUUID();
      await fixture.pool.query(
        "INSERT INTO membership_applications(id,applicant_user_id,plan_code,status) VALUES($1,$2,'community','draft')",
        [caseId, member],
      );
      let calls = 0,
        configured = false;
      const base = createAdminModelRegistry(),
        registry = {
          ...base,
          application: { ...base.application, approvedForAdmin: true },
        },
        drafts = createAiDraftsRepository(
          async () => fixture.database as never,
        ),
        work = createDraftWorkRepository(async () => fixture.database as never),
        runs = createAgentRunsRepository(
          async () => fixture.database as unknown as AutomationDatabase,
        ),
        budget = createAiBudgetRepository(
          async () => fixture.database as unknown as AutomationDatabase,
          () =>
            configured
              ? {
                  runMicrousd: 1000000,
                  dayMicrousd: 10000000,
                  monthMicrousd: 10000000,
                }
              : null,
        );
      const provider: AgentProviderFactory = () => ({
        stream: async (input) => {
          calls++;
          await input.onProviderReceipt?.("synthetic-t09-recovered");
          return {
            textStream: {
              async *[Symbol.asyncIterator]() {
                yield JSON.stringify({ body: "{{facts.applicationState}}" });
              },
            },
            finish: Promise.resolve({
              usage: { inputTokens: 10, outputTokens: 10 },
              steps: 1,
              toolExecutions: 0,
              finishReason: "stop",
              citations: [],
            }),
          };
        },
      });
      const service = createDraftGenerationService({
        kind: "application",
        promptVersion: "t09-isolated-v1",
        drafts,
        work,
        configuration: () => ({
          enabled: true,
          model: registry.application.key,
          registry,
          credentials: { openaiApiKey: "synthetic-test-key" },
        }),
        runtime: (runId) =>
          createAgentRuntime({
            agentRuns: runs,
            budget,
            administrativeTask: "application",
            modelRegistry: registry,
            createRunId: () => runId,
            providerFactories: { openai: provider, anthropic: provider },
          }),
      });
      await expect(service.prepareDraft(staff, caseId)).rejects.toMatchObject({
        code: "configuration_error",
      });
      expect(calls).toBe(0);
      const original = (
        await fixture.pool.query(
          "SELECT run_id,state,request_started_at FROM ai_draft_work WHERE case_id=$1",
          [caseId],
        )
      ).rows[0];
      expect(original).toMatchObject({
        state: "failed_before_request",
        request_started_at: null,
      });
      configured = true;
      const draft = await service.prepareDraft(staff, caseId);
      expect(draft.state).toBe("needs_review");
      expect(calls).toBe(1);
      expect(draft.runId).not.toBe(original.run_id);
      expect(
        (
          await fixture.pool.query(
            "SELECT status FROM agent_runs WHERE id=$1",
            [original.run_id],
          )
        ).rows[0].status,
      ).toBe("failed");
    });
    it("adopts an approved draft through the existing case writer as note only, preserving owner/due/manual fields and lifecycle", async () => {
      const caseId = randomUUID();
      await fixture.pool.query(
        "INSERT INTO membership_applications(id,applicant_user_id,plan_code,status) VALUES($1,$2,'community','draft')",
        [caseId, member],
      );
      const initial = await repo.updateApplicationCase(staff, caseId, {
        expectedVersion: "0",
        ownerProfileId: staff.profileId,
        dueAt: "2040-01-02T00:00:00Z",
        missingFields: ["phone"],
        nextActionCode: "contact_applicant",
        note: "Synthetic manual follow-up",
      });
      const drafts = createAiDraftsRepository(
          async () => fixture.database as never,
        ),
        facts = await drafts.getFacts(staff, { kind: "application", caseId }),
        runId = randomUUID();
      await fixture.pool.query(
        "INSERT INTO agent_runs(id,agent,trigger,status,provider,model,usage_state) VALUES($1,'board_reporter','scheduled','completed','synthetic-fixture','t09-no-provider','legacy_unknown')",
        [runId],
      );
      const draft = await drafts.saveProposedDraft(staff, {
        kind: "application",
        caseId,
        body: "{{facts.applicationState}}",
        claims: [
          {
            field: "applicationState",
            value: facts.values.applicationState.value,
            sourceId: "db:application:" + caseId,
          },
        ],
        sourceRefs: [],
        ownerId: null,
        dueAt: null,
        modelRoute: "synthetic-fixture-no-provider",
        promptVersion: "t09-test-v1",
        runId,
      });
      await drafts.reviewDraft(staff, {
        draftId: draft.id,
        expectedVersion: 1,
        decision: "approve",
      });
      const service = createApplicationDraftAdoptionService(drafts),
        input = {
          draftId: draft.id,
          expectedVersion: 2,
          expectedCaseVersion: initial.version,
        };
      const before = (
        await fixture.pool.query(
          "SELECT (SELECT count(*) FROM messages) AS messages,(SELECT count(*) FROM memberships) AS memberships,(SELECT count(*) FROM billing_attempts) AS attempts",
        )
      ).rows;
      const result = await service.adoptApplicationDraft(staff, caseId, input);
      expect(result.status).toBe("adopted");
      const record = await repo.getApplicationCase(staff, caseId);
      expect(record).toMatchObject({
        ownerProfileId: staff.profileId,
        dueAt: "2040-01-02T00:00:00Z",
        missingFields: ["phone"],
        nextActionCode: "contact_applicant",
        application: { status: "draft" },
      });
      expect(record?.timeline[0].note).toBe("申請狀態: 草稿");
      expect(
        (await service.adoptApplicationDraft(staff, caseId, input)).status,
      ).toBe("stale");
      expect(
        (
          await fixture.pool.query(
            "SELECT (SELECT count(*) FROM messages) AS messages,(SELECT count(*) FROM memberships) AS memberships,(SELECT count(*) FROM billing_attempts) AS attempts",
          )
        ).rows,
      ).toEqual(before);
    });
    it("rolls back the case note/version if the adoption audit fails, and rejects a different application", async () => {
      const caseId = randomUUID(),
        otherCase = randomUUID();
      await fixture.pool.query(
        "INSERT INTO membership_applications(id,applicant_user_id,plan_code,status) VALUES($1,$3,'community','draft'),($2,$3,'community','draft')",
        [caseId, otherCase, member],
      );
      const drafts = createAiDraftsRepository(
          async () => fixture.database as never,
        ),
        facts = await drafts.getFacts(staff, { kind: "application", caseId }),
        runId = randomUUID();
      await fixture.pool.query(
        "INSERT INTO agent_runs(id,agent,trigger,status,provider,model,usage_state) VALUES($1,'board_reporter','scheduled','completed','synthetic-fixture','t09-no-provider','legacy_unknown')",
        [runId],
      );
      const draft = await drafts.saveProposedDraft(staff, {
        kind: "application",
        caseId,
        body: "{{facts.applicationState}}",
        claims: [
          {
            field: "applicationState",
            value: facts.values.applicationState.value,
            sourceId: "db:application:" + caseId,
          },
        ],
        sourceRefs: [],
        ownerId: null,
        dueAt: null,
        modelRoute: "synthetic-fixture-no-provider",
        promptVersion: "t09-test-v1",
        runId,
      });
      await drafts.reviewDraft(staff, {
        draftId: draft.id,
        expectedVersion: 1,
        decision: "approve",
      });
      const service = createApplicationDraftAdoptionService(drafts),
        input = {
          draftId: draft.id,
          expectedVersion: 2,
          expectedCaseVersion: "0",
        };
      await expect(
        service.adoptApplicationDraft(staff, otherCase, input),
      ).rejects.toThrow("APPLICATION_DRAFT_CASE_MISMATCH");
      await fixture.pool.query(
        "CREATE FUNCTION t09_adopt_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='ai_draft_adopted' THEN RAISE EXCEPTION 'T09_AUDIT_REJECTED'; END IF; RETURN NEW; END $$; CREATE TRIGGER t09_adopt_audit_fail BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION t09_adopt_audit_fail()",
      );
      try {
        await expect(
          service.adoptApplicationDraft(staff, caseId, input),
        ).rejects.toThrow();
        const current = await repo.getApplicationCase(staff, caseId);
        expect(current?.version).toBe("0");
        expect(current?.timeline).toEqual([]);
        expect((await drafts.getDraft(staff, draft.id)).draft.state).toBe(
          "approved",
        );
      } finally {
        await fixture.pool.query(
          "DROP TRIGGER t09_adopt_audit_fail ON audit_events; DROP FUNCTION t09_adopt_audit_fail()",
        );
      }
    });
  },
);
