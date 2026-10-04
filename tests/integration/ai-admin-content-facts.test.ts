// @vitest-environment node
import { beforeAll, beforeEach, afterAll, it, expect, describe } from "vitest";
import { vi } from "vitest";
import {
  createContentDraftPreparationService,
  createContentDraftAdoptionService,
} from "@/lib/ai/content-drafts";
import { createDraftGenerationService } from "@/lib/ai/drafts/generation";
import { createDraftWorkRepository } from "@/lib/db/repos/ai-draft-work";
import { createAgentRunsRepository } from "@/lib/db/repos/agent-runs";
import { createAiBudgetRepository } from "@/lib/db/repos/ai-budget";
import { createAgentRuntime } from "@/lib/ai/runtime";
import { createAdminModelRegistry } from "@/lib/ai/providers/registry";
import type { AgentProviderFactory } from "@/lib/ai/provider";
import type { AutomationDatabase } from "@/lib/db/repos/journeys";
import { approvedFactsHash } from "@/lib/ai/drafts/validation";
import { randomUUID } from "node:crypto";
import { isolatedAuditDatabase } from "./audit-database-fixture";
import { createAiDraftsRepository } from "@/lib/db/repos/ai-drafts";
import type { KbDatabaseLoader } from "@/lib/db/repos/kb-documents";
import {
  claimsForGroundedTemplate,
  renderGroundedBody,
  validateGroundedContent,
} from "@/lib/ai/drafts/validation";
let f: Awaited<ReturnType<typeof isolatedAuditDatabase>>;
let eventId: string;
const actor = {
  kind: "staff" as const,
  profileId: "t12-staff",
  userId: "t12-staff-auth",
};
const repo = () =>
  createAiDraftsRepository((async () => f.database) as KbDatabaseLoader);
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== "1")(
  "T12 authoritative staff content facts in actual isolated PostgreSQL",
  () => {
    beforeAll(async () => {
      f = await isolatedAuditDatabase();
    }, 120000);
    beforeEach(async () => {
      await f.pool.query(
        "TRUNCATE profiles,events,posts,ai_review_drafts,ai_draft_work,agent_runs CASCADE",
      );
      await f.pool.query(
        "INSERT INTO profiles(id,auth_user_id,display_name,email,role) VALUES('t12-staff','t12-staff-auth','Synthetic staff','t12-staff@example.test','staff')",
      );
      eventId = randomUUID();
      await f.pool.query(
        "INSERT INTO events(id,slug,title_en,title_zh,description_en,description_zh,starts_at,ends_at,venue,capacity,registration_mode,ticket_price_hkd_cents) VALUES($1,'t12-event','Synthetic event','合成活動','Review event details.','請檢視活動資料。','2026-10-31T16:30:00Z','2026-10-31T18:30:00Z','Synthetic Hall',50,'ticketed',10000)",
        [eventId],
      );
    });
    afterAll(async () => {
      if (f) await f.close();
    });
    it("reads typed persisted price, capacity, Hong Kong time and venue separately for both locales", async () => {
      const en = await repo().getFacts(actor, {
        kind: "content",
        caseId: `event:${eventId}:en`,
      });
      const zh = await repo().getFacts(actor, {
        kind: "content",
        caseId: `event:${eventId}:zh-HK`,
      });
      expect(en.values.ticketPrice.value).toBe(100);
      expect(zh.values.ticketPrice.value).toBe(100);
      expect(en.values.capacity.value).toBe(50);
      expect(en.values.startsAt.value).toBe("2026-10-31T16:30:00.000Z");
      expect(zh.values.startsAt.value).toBe(en.values.startsAt.value);
      expect(en.values.venue.value).toBe(zh.values.venue.value);
      expect(renderGroundedBody("{{facts.startsAt}}", zh)).toContain(
        "2026年11月1日",
      );
      expect(
        validateGroundedContent(
          { body: "Ticket price HKD 90.", claims: [], sourceRefs: [] },
          en,
        ).valid,
      ).toBe(false);
      const body = Object.keys(en.values)
        .map((field) => "{{facts." + field + "}}")
        .join("\n");
      expect(
        validateGroundedContent(
          { body, claims: claimsForGroundedTemplate(body, en), sourceRefs: [] },
          en,
        ).valid,
      ).toBe(true);
    });
    it("requires all persisted event details in a copy draft and rejects fabricated benefits", async () => {
      const facts = await repo().getFacts(actor, {
        kind: "content",
        caseId: `event:${eventId}:en`,
      });
      for (const body of [
        "Please join us.",
        "Enjoy guaranteed exclusive member benefits.",
      ])
        expect(
          validateGroundedContent({ body, claims: [], sourceRefs: [] }, facts)
            .valid,
        ).toBe(false);
    });
    it("generates both locale proposals with actual runtime/budget/work, rejects forged packs, and copies only fresh human-approved text", async () => {
      const loader = async () => f.database as unknown as AutomationDatabase,
        drafts = repo(),
        work = createDraftWorkRepository(
          (async () => f.database) as KbDatabaseLoader,
        ),
        runs = createAgentRunsRepository(loader);
      const budget = createAiBudgetRepository(loader, () => ({
        runMicrousd: 2_000_000,
        dayMicrousd: 5_000_000,
        monthMicrousd: 10_000_000,
      }));
      const base = createAdminModelRegistry("openai:gpt-4.1-mini"),
        registry = {
          ...base,
          content: { ...base.content, approvedForAdmin: true },
        };
      const calls = vi.fn(),
        provider: AgentProviderFactory = () => ({
          stream: async (request) => {
            calls();
            await request.onProviderReceipt?.(
              "synthetic-content-" + randomUUID(),
            );
            const payload = JSON.parse(String(request.messages[0].content));
            const body =
              (payload.locale === "zh-HK"
                ? "請檢視活動資料。"
                : "Review event details.") +
              "\n" +
              Object.keys(payload.facts)
                .map((field) => "{{facts." + field + "}}")
                .join("\n");
            return {
              textStream: {
                async *[Symbol.asyncIterator]() {
                  yield JSON.stringify({ body });
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
      const generate = createDraftGenerationService({
        kind: "content",
        promptVersion: "content-copy-v1",
        drafts,
        work,
        context: (a, c, h) => drafts.getContentContext(a, c, h),
        configuration: () => ({
          enabled: true,
          model: "openai:gpt-4.1-mini",
          registry,
          credentials: { openaiApiKey: "synthetic-offline-provider" },
        }),
        runtime: (runId) =>
          createAgentRuntime({
            agentRuns: runs,
            budget,
            administrativeTask: "content",
            modelRegistry: registry,
            createRunId: () => runId,
            providerFactories: { openai: provider, anthropic: provider },
          }),
      });
      const prepare = createContentDraftPreparationService({
          drafts,
          generate,
        }),
        adopt = createContentDraftAdoptionService(drafts);
      const sourceFacts = await drafts.getFacts(actor, {
        kind: "content",
        caseId: `event:${eventId}:en`,
      });
      const forged = structuredClone(sourceFacts);
      forged.values.ticketPrice.value = 90;
      forged.versionHash = approvedFactsHash(forged);
      await expect(
        prepare.prepare(actor, { kind: "event", sourceFacts: forged }),
      ).rejects.toThrow("DRAFT_GENERATION_STALE");
      expect(calls).not.toHaveBeenCalled();
      const proposal = await prepare.prepare(actor, {
        kind: "event",
        sourceFacts,
      });
      expect(proposal.state).toBe("needs_review");
      expect(
        (await prepare.prepare(actor, { kind: "event", sourceFacts })).id,
      ).toBe(proposal.id);
      expect(calls).toHaveBeenCalledTimes(1);
      const chineseFacts = await drafts.getFacts(actor, {
        kind: "content",
        caseId: `event:${eventId}:zh-HK`,
      });
      const chinese = await prepare.prepare(actor, {
        kind: "event",
        sourceFacts: chineseFacts,
      });
      expect(chinese.state).toBe("needs_review");
      expect(calls).toHaveBeenCalledTimes(2);
      await expect(
        adopt.adopt(actor, "event", eventId, "en", {
          draftId: proposal.id,
          expectedVersion: proposal.version,
        }),
      ).rejects.toThrow("AI_DRAFT_NOT_APPROVED");
      const review = await drafts.reviewDraft(actor, {
        draftId: proposal.id,
        expectedVersion: proposal.version,
        decision: "approve",
      });
      expect(review.status).toBe("reviewed");
      const before = (
        await f.pool.query("SELECT * FROM events WHERE id=$1", [eventId])
      ).rows[0];
      const copied = await adopt.adopt(actor, "event", eventId, "en", {
        draftId: proposal.id,
        expectedVersion: review.draft.version,
      });
      expect(copied.status).toBe("adopted");
      if (copied.status === "adopted")
        expect(copied.value.body).toContain("$100.00");
      expect(
        (await f.pool.query("SELECT * FROM events WHERE id=$1", [eventId]))
          .rows[0],
      ).toEqual(before);
      await expect(
        adopt.adopt(actor, "event", randomUUID(), "en", {
          draftId: proposal.id,
          expectedVersion: review.draft.version,
        }),
      ).rejects.toThrow("CONTENT_DRAFT_CASE_MISMATCH");
      await expect(
        adopt.adopt(actor, "event", eventId, "zh-HK", {
          draftId: proposal.id,
          expectedVersion: review.draft.version,
        }),
      ).rejects.toThrow("CONTENT_DRAFT_CASE_MISMATCH");
      await f.pool.query("UPDATE events SET capacity=40 WHERE id=$1", [
        eventId,
      ]);
      expect(
        (
          await adopt.adopt(actor, "event", eventId, "en", {
            draftId: proposal.id,
            expectedVersion: review.draft.version,
          })
        ).status,
      ).toBe("stale");
      expect(
        (
          await f.pool.query(
            "SELECT count(*)::int AS n FROM agent_runs WHERE agent='writer' OR profile_id IS NOT NULL",
          )
        ).rows[0].n,
      ).toBe(0);
      expect(
        (
          await f.pool.query(
            "SELECT count(*)::int AS n FROM messages WHERE direction='outbound'",
          )
        ).rows[0].n,
      ).toBe(0);
      expect(
        (
          await f.pool.query("SELECT usage_state FROM ai_budget_reservations")
        ).rows.map((r) => r.usage_state),
      ).toEqual(["known", "known"]);
    });
    it("changes the authoritative version when persisted business facts change and denies a demoted actor", async () => {
      const before = await repo().getFacts(actor, {
        kind: "content",
        caseId: `event:${eventId}:en`,
      });
      await f.pool.query(
        "UPDATE events SET ticket_price_hkd_cents=11000 WHERE id=$1",
        [eventId],
      );
      const after = await repo().getFacts(actor, {
        kind: "content",
        caseId: `event:${eventId}:en`,
      });
      expect(after.versionHash).not.toBe(before.versionHash);
      await f.pool.query(
        "UPDATE profiles SET role='member' WHERE id='t12-staff'",
      );
      await expect(
        repo().getFacts(actor, {
          kind: "content",
          caseId: `event:${eventId}:en`,
        }),
      ).rejects.toThrow();
    });
  },
);
