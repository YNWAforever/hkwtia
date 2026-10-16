import { createPublicConciergeFactsReader } from "@/lib/db/repos/ai-public-facts";
// @vitest-environment node
import { randomUUID, createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { isolatedAuditDatabase } from "./audit-database-fixture";
import {
  createAiDraftsRepository,
  type ApprovedDraftFactReader,
} from "@/lib/db/repos/ai-drafts";
import { createDraftWorkRepository } from "@/lib/db/repos/ai-draft-work";
import { createKnowledgeGovernanceRepository } from "@/lib/db/repos/knowledge-governance";
import { createDeterministicTestEmbeddingAdapter } from "@/lib/ai/embeddings";
import { approvedFactsHash } from "@/lib/ai/drafts/validation";
import type { ApprovedFactPack, AdminAiDraft } from "@/lib/ai/drafts/contracts";
import type { AdminActor } from "@/lib/membership/lifecycle";
let fixture: Awaited<ReturnType<typeof isolatedAuditDatabase>>,
  sourceId: string;
const owner: AdminActor = {
    kind: "staff",
    profileId: "t08-owner",
    userId: "t08-owner",
  },
  reviewer: AdminActor = {
    kind: "exco",
    profileId: "t08-reviewer",
    userId: "t08-reviewer",
  },
  second: AdminActor = {
    kind: "staff",
    profileId: "t08-second",
    userId: "t08-second",
  };
const now = () => new Date("2040-01-01T00:00:00Z");
const readFacts: ApprovedDraftFactReader = async (_actor, input, tx) => {
  const result = await tx.execute(
    sql`SELECT * FROM t08_acceptance_cases WHERE id=${input.caseId} FOR SHARE`,
  );
  const row = (
    result as {
      rows: Record<string, unknown>[];
    }
  ).rows[0];
  if (!row) throw Error("AI_DRAFT_CASE_UNAVAILABLE");
  const sourceResult = await tx.execute(
    sql`SELECT * FROM kb_documents WHERE source_id=${sourceId} ORDER BY chunk_start LIMIT 1 FOR SHARE`,
  );
  const source = (
    Array.isArray(sourceResult)
      ? sourceResult
      : (
          sourceResult as {
            rows: Record<string, unknown>[];
          }
        ).rows
  )[0] as Record<string, unknown>;
  const recordId = "db:application:" + input.caseId;
  const pack: ApprovedFactPack = {
    caseId: input.caseId,
    locale: "en",
    versionHash: "a".repeat(64),
    asOf: input.asOf.toISOString(),
    values: {
      membershipFee: {
        value: (
          source.structured_facts as {
            membershipFee: number;
            currency: "HKD";
          }
        ).membershipFee,
        sourceId,
        label: "Membership fee",
        format: "money",
        currency: (
          source.structured_facts as {
            membershipFee: number;
            currency: "HKD";
          }
        ).currency,
      },
      caseState: {
        value: (
          row.payload as {
            state: string;
          }
        ).state,
        sourceId: recordId,
        label: "Application state",
        format: "text",
      },
    },
    sourceRefs: [
      {
        sourceId,
        version: String(source.version),
        locale: "en",
        audience: "public",
        effectiveFrom: new Date(String(source.effective_from)).toISOString(),
        effectiveTo: source.effective_to
          ? new Date(String(source.effective_to)).toISOString()
          : null,
        contentHash: String(source.content_hash),
      },
    ],
    recordSources: {
      [recordId]: createHash("sha256")
        .update(
          JSON.stringify({ payload: row.payload, revision: row.revision }),
        )
        .digest("hex"),
    },
    sourceUrls: { [sourceId]: String(source.url) },
    comparisonAvailable: false,
    displayLabels: { yes: "Yes", no: "No", notAvailable: "Not available" },
  };
  return { ...pack, versionHash: approvedFactsHash(pack) };
};
function repository() {
  return createAiDraftsRepository(
    async () => fixture.database as never,
    readFacts,
    now,
  );
}
async function proposed(
  body = "Verified details:\n{{facts.membershipFee}}\n{{facts.caseState}}\nPlease contact staff.",
  runId: string = randomUUID(),
  caseId = "synthetic-" + randomUUID(),
): Promise<AdminAiDraft> {
  await fixture.pool.query(
    "INSERT INTO t08_acceptance_cases(id,payload) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING",
    [caseId, JSON.stringify({ state: "pending_review" })],
  );
  await fixture.pool.query(
    "INSERT INTO agent_runs(id,agent,trigger,profile_id) VALUES($1,'concierge','scheduled','t08-owner') ON CONFLICT DO NOTHING",
    [runId],
  );
  return repository().saveProposedDraft(owner, {
    kind: "application",
    caseId,
    body,
    claims: [
      { field: "membershipFee", value: 100, sourceId },
      {
        field: "caseState",
        value: "pending_review",
        sourceId: "db:application:" + caseId,
      },
    ],
    sourceRefs: (
      await readFacts(
        owner,
        { kind: "application", caseId, asOf: now() },
        fixture.database as never,
      )
    ).sourceRefs,
    ownerId: owner.profileId,
    dueAt: null,
    modelRoute: "synthetic-explicit-test-route",
    promptVersion: "t08-fixture-v1",
    runId,
  });
}
async function approve(draft: AdminAiDraft) {
  return repository().reviewDraft(reviewer, {
    draftId: draft.id,
    expectedVersion: draft.version,
    decision: "approve",
  });
}
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== "1")(
  "AI draft transactional review on owned PostgreSQL16",
  () => {
    beforeAll(async () => {
      fixture = await isolatedAuditDatabase(58);
      await fixture.migrateRemaining();
      await fixture.pool.query(
        "INSERT INTO profiles(id,auth_user_id,email,display_name,role) VALUES('t08-owner','t08-owner','owner@t08.example.test','Synthetic owner','staff'),('t08-reviewer','t08-reviewer','reviewer@t08.example.test','Synthetic reviewer','exco'),('t08-second','t08-second','second@t08.example.test','Synthetic second','staff')",
      );
      await fixture.pool.query(
        "CREATE TABLE t08_acceptance_cases(id text PRIMARY KEY,payload jsonb NOT NULL,revision integer NOT NULL DEFAULT 1)",
      );
      sourceId = randomUUID();
      const governance = createKnowledgeGovernanceRepository(
        async () => fixture.database as never,
        () => createDeterministicTestEmbeddingAdapter(),
        () => [reviewer.profileId],
      );
      await governance.createVersion(owner, {
        sourceId,
        expectedVersion: 0,
        namespace: "m4a-core-v1",
        locale: "en",
        title: "Approved synthetic policy",
        url: "https://example.test/policy",
        content: "Synthetic membership fee HK$100. Manual review required.",
        audience: "public",
        effectiveFrom: "2039-01-01T00:00:00Z",
        effectiveTo: null,
        reviewDue: "2041-01-01T00:00:00Z",
        structuredFacts: { membershipFee: 100, currency: "HKD" },
      });
      await governance.reviewVersion(reviewer, {
        sourceId,
        locale: "en",
        version: 1,
        decision: "approve",
      });
      await governance.indexVersion(owner, {
        sourceId,
        locale: "en",
        version: 1,
      });
    }, 120000);
    afterAll(async () => {
      if (fixture) await fixture.close();
    });
    it("stores invalid final amount as proposed with violations and no rendered public body", async () => {
      const draft = await proposed("The membership fee is HK$90.");
      expect(draft.state).toBe("proposed");
      const result = await approve(draft);
      expect(result.status).toBe("invalid");
      const row = (
        await fixture.pool.query(
          "SELECT state,rendered_body,violations FROM ai_review_drafts WHERE id=$1",
          [draft.id],
        )
      ).rows[0];
      expect(row.state).toBe("proposed");
      expect(row.rendered_body).toBe("");
      expect(
        row.violations.some(
          (v: { code: string }) => v.code === "UNBOUND_CRITICAL_FACT",
        ),
      ).toBe(true);
    });
    it("saves a valid draft then records review and content-free audit atomically without business effects", async () => {
      const counts = await fixture.pool.query(
        "SELECT (SELECT count(*) FROM memberships) AS memberships,(SELECT count(*) FROM messages) AS messages",
      );
      const draft = await proposed();
      expect(draft.state).toBe("needs_review");
      const reviewed = await approve(draft);
      expect(reviewed).toMatchObject({
        status: "reviewed",
        draft: { state: "approved", version: 2 },
      });
      expect(reviewed.reviewId).toMatch(/^[a-f0-9-]{36}$/);
      const row = (
        await fixture.pool.query(
          "SELECT metadata FROM audit_events WHERE target_id=$1 AND action='ai_draft_reviewed'",
          [draft.id],
        )
      ).rows[0];
      expect(row.metadata).toMatchObject({ version: 2, decision: "approve" });
      expect(JSON.stringify(row.metadata)).not.toContain("HK$100");
      expect(
        (
          await fixture.pool.query(
            "SELECT (SELECT count(*) FROM memberships) AS memberships,(SELECT count(*) FROM messages) AS messages",
          )
        ).rows,
      ).toEqual(counts.rows);
    });
    it("two concurrent reviewers produce exactly one review and one version conflict", async () => {
      const draft = await proposed();
      const input = {
        draftId: draft.id,
        expectedVersion: 1,
        decision: "approve",
      };
      const results = await Promise.allSettled([
        repository().reviewDraft(reviewer, input),
        repository().reviewDraft(second, input),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
      expect(
        Number(
          (
            await fixture.pool.query(
              "SELECT count(*) AS n FROM ai_draft_reviews WHERE draft_id=$1",
              [draft.id],
            )
          ).rows[0].n,
        ),
      ).toBe(1);
    });
    it("changed current case facts commit stale state without an approval", async () => {
      const draft = await proposed();
      await fixture.pool.query(
        "UPDATE t08_acceptance_cases SET payload=$2::jsonb,revision=revision+1 WHERE id=$1",
        [draft.caseId, JSON.stringify({ state: "active" })],
      );
      const result = await approve(draft);
      expect(result).toMatchObject({
        status: "stale",
        reviewId: null,
        draft: { state: "stale", version: 2 },
      });
      expect(
        (
          await fixture.pool.query(
            "SELECT state FROM ai_review_drafts WHERE id=$1",
            [draft.id],
          )
        ).rows[0].state,
      ).toBe("stale");
    });
    it("editing approved text increments version, clears approval and retains the old decision and revision", async () => {
      const draft = await proposed();
      const reviewed = await approve(draft);
      const edited = await repository().editDraft(owner, {
        draftId: draft.id,
        expectedVersion: 2,
        body: draft.body + "\nPlease contact staff for help.",
      });
      expect(edited).toMatchObject({ version: 3, state: "needs_review" });
      const row = (
        await fixture.pool.query(
          "SELECT approved_by,approved_at,approved_version FROM ai_review_drafts WHERE id=$1",
          [draft.id],
        )
      ).rows[0];
      expect(row).toEqual({
        approved_by: null,
        approved_at: null,
        approved_version: null,
      });
      expect(
        Number(
          (
            await fixture.pool.query(
              "SELECT count(*) AS n FROM ai_draft_revisions WHERE draft_id=$1",
              [draft.id],
            )
          ).rows[0].n,
        ),
      ).toBe(3);
      expect(
        (
          await fixture.pool.query(
            "SELECT id FROM ai_draft_reviews WHERE draft_id=$1",
            [draft.id],
          )
        ).rows[0].id,
      ).toBe(reviewed.reviewId);
    });
    it("old approval cannot adopt substituted or edited text", async () => {
      const draft = await proposed();
      await approve(draft);
      await repository().editDraft(owner, {
        draftId: draft.id,
        expectedVersion: 2,
        body: "Please contact staff.",
      });
      const adopt = vi.fn();
      await expect(
        repository().withApprovedDraft(
          reviewer,
          { draftId: draft.id, expectedVersion: 2 },
          adopt,
        ),
      ).rejects.toThrow("AI_DRAFT_VERSION_CONFLICT");
      expect(adopt).not.toHaveBeenCalled();
    });
    it("final adoption rechecks changed facts and commits stale without invoking effect callback", async () => {
      const draft = await proposed();
      await approve(draft);
      await fixture.pool.query(
        "UPDATE t08_acceptance_cases SET revision=revision+1 WHERE id=$1",
        [draft.caseId],
      );
      const adopt = vi.fn();
      const result = await repository().withApprovedDraft(
        reviewer,
        { draftId: draft.id, expectedVersion: 2 },
        adopt,
      );
      expect(result.status).toBe("stale");
      expect(adopt).not.toHaveBeenCalled();
      expect(
        (
          await fixture.pool.query(
            "SELECT state,approved_by FROM ai_review_drafts WHERE id=$1",
            [draft.id],
          )
        ).rows[0],
      ).toEqual({ state: "stale", approved_by: null });
    });
    it("fresh server role revocation prevents review despite an old admin actor object", async () => {
      const draft = await proposed();
      await fixture.pool.query(
        "UPDATE profiles SET role='member' WHERE id='t08-second'",
      );
      try {
        await expect(
          repository().reviewDraft(second, {
            draftId: draft.id,
            expectedVersion: 1,
            decision: "approve",
          }),
        ).rejects.toThrow("FORBIDDEN");
        expect(
          (
            await fixture.pool.query(
              "SELECT version FROM ai_review_drafts WHERE id=$1",
              [draft.id],
            )
          ).rows[0].version,
        ).toBe(1);
      } finally {
        await fixture.pool.query(
          "UPDATE profiles SET role='staff' WHERE id='t08-second'",
        );
      }
    });
    it("an audit insertion failure rolls back both the review decision and version", async () => {
      const draft = await proposed();
      await fixture.pool.query(
        "CREATE FUNCTION t08_reject_review_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='ai_draft_reviewed' THEN RAISE EXCEPTION 'synthetic audit unavailable'; END IF; RETURN NEW; END $$; CREATE TRIGGER t08_review_audit_rejection BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION t08_reject_review_audit()",
      );
      try {
        await expect(approve(draft)).rejects.toThrow();
        expect(
          (
            await fixture.pool.query(
              "SELECT state,version FROM ai_review_drafts WHERE id=$1",
              [draft.id],
            )
          ).rows[0],
        ).toEqual({ state: "needs_review", version: 1 });
        expect(
          (
            await fixture.pool.query(
              "SELECT id FROM ai_draft_reviews WHERE draft_id=$1",
              [draft.id],
            )
          ).rows,
        ).toHaveLength(0);
      } finally {
        await fixture.pool.query(
          "DROP TRIGGER t08_review_audit_rejection ON audit_events; DROP FUNCTION t08_reject_review_audit()",
        );
      }
    });
    it("withdrawn approved source invalidates a formerly approved draft and preserves its review", async () => {
      const draft = await proposed();
      await approve(draft);
      await fixture.pool.query(
        "UPDATE kb_documents SET approval_state='withdrawn',index_state='unindexed' WHERE source_id=$1",
        [sourceId],
      );
      try {
        const adopt = vi.fn();
        expect(
          (
            await repository().withApprovedDraft(
              reviewer,
              { draftId: draft.id, expectedVersion: 2 },
              adopt,
            )
          ).status,
        ).toBe("stale");
        expect(adopt).not.toHaveBeenCalled();
        expect(
          (
            await fixture.pool.query(
              "SELECT id FROM ai_draft_reviews WHERE draft_id=$1",
              [draft.id],
            )
          ).rows,
        ).toHaveLength(1);
      } finally {
        await fixture.pool.query(
          "UPDATE kb_documents SET approval_state='approved',index_state='ready' WHERE source_id=$1",
          [sourceId],
        );
      }
    });
    it("the prior rendered revision remains frozen when current facts change", async () => {
      const draft = await proposed();
      await approve(draft);
      await fixture.pool.query(
        "UPDATE t08_acceptance_cases SET revision=revision+1 WHERE id=$1",
        [draft.caseId],
      );
      const details = await repository().getDraft(reviewer, draft.id);
      expect(details.draft.state).toBe("stale");
      expect(details.previousBody).toContain("Membership fee: HK$100.00");
      expect(details.previousBody).not.toContain("{{facts.");
    });
    it("member is denied before any DB connection is requested", async () => {
      const load = vi.fn();
      await expect(
        createAiDraftsRepository(load, readFacts, now).getDraft(
          { kind: "member", profileId: "t08-owner", userId: "t08-owner" },
          randomUUID(),
        ),
      ).rejects.toThrow("FORBIDDEN");
      expect(load).not.toHaveBeenCalled();
    });
    async function publicInput() {
      const original = await proposed();
      const current = await readFacts(
        owner,
        { kind: "application", caseId: original.caseId, asOf: now() },
        fixture.database as never,
      );
      const conversationId = randomUUID(),
        runId = randomUUID();
      await fixture.pool.query(
        "INSERT INTO conversations(id,profile_id,locale,expires_at) VALUES($1,'t08-owner','en','2041-01-01')",
        [conversationId],
      );
      await fixture.pool.query(
        "INSERT INTO agent_runs(id,conversation_id,profile_id,agent,trigger) VALUES($1,$2,'t08-owner','concierge','web')",
        [runId, conversationId],
      );
      return {
        actor: {
          kind: "agent",
          agent: "concierge",
          profileId: "t08-owner",
          conversationId,
          runId,
          trigger: "web",
        } as const,
        locale: "en" as const,
        conversationId,
        citations: [
          {
            sourceId: "kb:pinned",
            title: "Approved synthetic policy",
            knowledgeRef: current.sourceRefs[0]!,
          },
        ],
        asOf: now(),
      };
    }
    it("public facts are re-read from the exact approved current source and bound to the actual run", async () => {
      const input = await publicInput();
      const facts = await createPublicConciergeFactsReader(
        async () => fixture.database as never,
      )(input);
      expect(facts.values.membershipFee).toMatchObject({
        value: 100,
        currency: "HKD",
        sourceId,
      });
      expect(facts.caseId).toBe(input.conversationId);
      expect(facts.versionHash).toBe(approvedFactsHash(facts));
      expect(facts.values.caseState).toBeUndefined();
    });
    it("public grounding rejects an expired source even with its former correct version and hash", async () => {
      const input = await publicInput();
      await expect(
        createPublicConciergeFactsReader(async () => fixture.database as never)(
          { ...input, asOf: new Date("2042-01-01T00:00:00Z") },
        ),
      ).rejects.toThrow("CONCIERGE_FACT_SOURCE_CHANGED");
    });
    it("public grounding rejects a changed pinned hash instead of accepting the newest source under its old reference", async () => {
      const input = await publicInput();
      await expect(
        createPublicConciergeFactsReader(async () => fixture.database as never)(
          {
            ...input,
            citations: [
              {
                ...input.citations[0]!,
                knowledgeRef: {
                  ...input.citations[0]!.knowledgeRef,
                  contentHash: "f".repeat(64),
                },
              },
            ],
          },
        ),
      ).rejects.toThrow("CONCIERGE_FACT_SOURCE_CHANGED");
    });
    it("public grounding denies staff-only scope before loading a database", async () => {
      const input = await publicInput(),
        load = vi.fn();
      await expect(
        createPublicConciergeFactsReader(load)({
          ...input,
          citations: [
            {
              ...input.citations[0]!,
              knowledgeRef: {
                ...input.citations[0]!.knowledgeRef,
                audience: "staff",
              },
            },
          ],
        }),
      ).rejects.toThrow("CONCIERGE_FACT_SCOPE_INVALID");
      expect(load).not.toHaveBeenCalled();
    });
    it("public grounding rejects a substituted server run/profile binding", async () => {
      const input = await publicInput();
      await expect(
        createPublicConciergeFactsReader(async () => fixture.database as never)(
          { ...input, actor: { ...input.actor, profileId: "t08-reviewer" } },
        ),
      ).rejects.toThrow("CONCIERGE_FACT_ACTOR_INVALID");
    });
    it.each(["ai_draft_revisions", "ai_draft_reviews"])(
      "preserves append-only %s evidence against in-place rewrite and deletion",
      async (table) => {
        const draft = await proposed();
        await approve(draft);
        expect(
          Number(
            (
              await fixture.pool.query(
                `SELECT count(*) n FROM ${table} WHERE draft_id=$1`,
                [draft.id],
              )
            ).rows[0].n,
          ),
        ).toBeGreaterThan(0);
        await expect(
          fixture.pool.query(
            `UPDATE ${table} SET created_at=now() WHERE draft_id=$1`,
            [draft.id],
          ),
        ).rejects.toThrow("AI_DRAFT_HISTORY_IMMUTABLE");
        await expect(
          fixture.pool.query(`DELETE FROM ${table} WHERE draft_id=$1`, [
            draft.id,
          ]),
        ).rejects.toThrow("AI_DRAFT_HISTORY_IMMUTABLE");
      },
    );
    function workKey(extra: Record<string, unknown> = {}) {
      return {
        kind: "application",
        caseId: "synthetic-work-" + randomUUID(),
        factsHash: "e".repeat(64),
        agentVersion: "application:v1",
        idempotencyKey: "synthetic-request",
        ...extra,
      };
    }
    function workRepository(clock: () => Date = now) {
      return createDraftWorkRepository(
        async () => fixture.database as never,
        clock,
        60,
      );
    }
    it("concurrent draft-work claims have one owner and return busy to the duplicate", async () => {
      const key = workKey();
      const claims = await Promise.all([
        workRepository().claimDraftWork(key),
        workRepository().claimDraftWork(key),
      ]);
      expect(claims.map((c) => c.disposition).sort()).toEqual([
        "busy",
        "claimed",
      ]);
      expect(new Set(claims.map((c) => c.runId)).size).toBe(1);
      expect(
        claims.find((c) => c.disposition === "busy")!.claimToken,
      ).toBeNull();
    });
    it("kind and facts version are part of the durable work key", async () => {
      const key = workKey();
      const a = await workRepository().claimDraftWork(key),
        b = await workRepository().claimDraftWork({ ...key, kind: "support" }),
        c = await workRepository().claimDraftWork({
          ...key,
          factsHash: "f".repeat(64),
        });
      expect(new Set([a.runId, b.runId, c.runId]).size).toBe(3);
    });
    it("only a pre-request expired lease can be reclaimed, with a new fencing token", async () => {
      let at = now();
      const work = workRepository(() => at),
        key = workKey();
      const first = await work.claimDraftWork(key);
      at = new Date(at.getTime() + 61000);
      const second = await work.claimDraftWork(key);
      expect(second).toMatchObject({
        runId: first.runId,
        disposition: "claimed",
      });
      expect(second.claimToken).not.toBe(first.claimToken);
      await expect(
        work.markDraftRequestStarted({
          runId: first.runId,
          claimToken: first.claimToken,
        }),
      ).rejects.toThrow("DRAFT_WORK_CLAIM_CONFLICT");
      await work.markDraftRequestStarted({
        runId: second.runId,
        claimToken: second.claimToken,
      });
    });
    it("a requesting crash becomes unknown and never gains a retry owner after TTL", async () => {
      let at = now();
      const work = workRepository(() => at),
        key = workKey();
      const claimed = await work.claimDraftWork(key);
      await work.markDraftRequestStarted({
        runId: claimed.runId,
        claimToken: claimed.claimToken,
      });
      at = new Date(at.getTime() + 61000);
      expect(await work.claimDraftWork(key)).toMatchObject({
        runId: claimed.runId,
        disposition: "unknown",
        claimToken: null,
      });
      at = new Date(at.getTime() + 86400000);
      expect(await work.claimDraftWork(key)).toMatchObject({
        disposition: "unknown",
        claimToken: null,
      });
      const row = (
        await fixture.pool.query(
          "SELECT state,request_started_at FROM ai_draft_work WHERE run_id=$1",
          [claimed.runId],
        )
      ).rows[0];
      expect(row.state).toBe("unknown");
      expect(row.request_started_at).not.toBeNull();
    });
    it("a started request cannot be relabelled failed-before-request to gain a retry", async () => {
      const work = workRepository(),
        claim = await work.claimDraftWork(workKey());
      await work.markDraftRequestStarted({
        runId: claim.runId,
        claimToken: claim.claimToken,
      });
      await expect(
        work.finishDraftWork({
          runId: claim.runId,
          claimToken: claim.claimToken,
          state: "failed_before_request",
          draftId: null,
          providerRequestId: null,
        }),
      ).rejects.toThrow("DRAFT_WORK_CLAIM_CONFLICT");
      expect(
        (
          await fixture.pool.query(
            "SELECT state FROM ai_draft_work WHERE run_id=$1",
            [claim.runId],
          )
        ).rows[0].state,
      ).toBe("requesting");
    });
    it("an explicit known pre-request failure can be claimed again with a fenced token", async () => {
      const work = workRepository(),
        key = workKey(),
        first = await work.claimDraftWork(key);
      await work.finishDraftWork({
        runId: first.runId,
        claimToken: first.claimToken,
        state: "failed_before_request",
        draftId: null,
        providerRequestId: null,
      });
      const next = await work.claimDraftWork(key);
      expect(next.disposition).toBe("claimed");
      expect(next.claimToken).not.toBe(first.claimToken);
    });
    it("late known provider receipt can reconcile the same unknown request, never a replacement request", async () => {
      let at = now();
      const work = workRepository(() => at);
      const original = await proposed();
      const key = workKey({
        caseId: original.caseId,
        factsHash: original.factsHash,
      });
      const claim = await work.claimDraftWork(key);
      await work.markDraftRequestStarted({
        runId: claim.runId,
        claimToken: claim.claimToken,
      });
      at = new Date(at.getTime() + 61000);
      expect((await work.claimDraftWork(key)).disposition).toBe("unknown");
      const result = await proposed(
        original.body,
        claim.runId,
        original.caseId,
      );
      const receipt = {
        runId: claim.runId,
        claimToken: claim.claimToken,
        state: "succeeded",
        draftId: result.id,
        providerRequestId: "synthetic-test-request-not-live-provider",
      };
      await work.finishDraftWork(receipt);
      await work.finishDraftWork(receipt);
      expect(await work.claimDraftWork(key)).toMatchObject({
        disposition: "reuse",
        runId: claim.runId,
        draftId: result.id,
        claimToken: null,
      });
    });
    it("success requires a receipt and a draft bound to the same run/case/facts/kind", async () => {
      const unrelated = await proposed();
      const work = workRepository(),
        claim = await work.claimDraftWork(workKey());
      await work.markDraftRequestStarted({
        runId: claim.runId,
        claimToken: claim.claimToken,
      });
      await expect(
        work.finishDraftWork({
          runId: claim.runId,
          claimToken: claim.claimToken,
          state: "succeeded",
          draftId: unrelated.id,
          providerRequestId: null,
        }),
      ).rejects.toThrow("DRAFT_WORK_RECEIPT_REQUIRED");
      await expect(
        work.finishDraftWork({
          runId: claim.runId,
          claimToken: claim.claimToken,
          state: "succeeded",
          draftId: unrelated.id,
          providerRequestId: "synthetic-test-request",
        }),
      ).rejects.toThrow("DRAFT_WORK_RESULT_INVALID");
    });
    it("an accepted unknown receipt cannot be replaced by a different provider request during reconciliation", async () => {
      const original = await proposed(),
        work = workRepository(),
        key = workKey({
          caseId: original.caseId,
          factsHash: original.factsHash,
        });
      const claim = await work.claimDraftWork(key);
      await work.markDraftRequestStarted({
        runId: claim.runId,
        claimToken: claim.claimToken,
      });
      await work.finishDraftWork({
        runId: claim.runId,
        claimToken: claim.claimToken,
        state: "unknown",
        draftId: null,
        providerRequestId: "synthetic-accepted-request-A",
      });
      const saved = await proposed(original.body, claim.runId, original.caseId);
      await expect(
        work.finishDraftWork({
          runId: claim.runId,
          claimToken: claim.claimToken,
          state: "succeeded",
          draftId: saved.id,
          providerRequestId: "synthetic-unrelated-request-B",
        }),
      ).rejects.toThrow("DRAFT_WORK_RECEIPT_CONFLICT");
      expect(
        (
          await fixture.pool.query(
            "SELECT state,provider_request_id FROM ai_draft_work WHERE run_id=$1",
            [claim.runId],
          )
        ).rows[0],
      ).toEqual({
        state: "unknown",
        provider_request_id: "synthetic-accepted-request-A",
      });
    });
    it("a valid adoption writes through an existing staff task transaction and does not send or change membership", async () => {
      const draft = await proposed();
      await approve(draft);
      const before = (
        await fixture.pool.query(
          "SELECT (SELECT count(*) FROM messages) AS messages,(SELECT count(*) FROM memberships) AS memberships",
        )
      ).rows;
      const result = await repository().withApprovedDraft(
        reviewer,
        { draftId: draft.id, expectedVersion: 2 },
        async (tx) =>
          tx.execute(
            sql`INSERT INTO staff_tasks(kind,dedupe_key,summary_code,context) VALUES('t08-reviewed-draft',${draft.id},'manual_review',${JSON.stringify({ aiDraftId: draft.id, aiDraftVersion: 2 })}::jsonb) RETURNING id`,
          ),
      );
      expect(result.status).toBe("adopted");
      expect(
        (
          await fixture.pool.query(
            "SELECT id FROM staff_tasks WHERE dedupe_key=$1",
            [draft.id],
          )
        ).rows,
      ).toHaveLength(1);
      expect(
        (
          await fixture.pool.query(
            "SELECT (SELECT count(*) FROM messages) AS messages,(SELECT count(*) FROM memberships) AS memberships",
          )
        ).rows,
      ).toEqual(before);
    });
    it("the registered support reader loads minimized current staff-task facts and detects an actual case update", async () => {
      const task = (
        await fixture.pool.query(
          "INSERT INTO staff_tasks(kind,dedupe_key,summary_code,context) VALUES('synthetic-support',$1,'manual_review',$2::jsonb) RETURNING id",
          [
            randomUUID(),
            JSON.stringify({
              locale: "en",
              supportVersion: "1",
              contactEmail: "synthetic@t08.example.test",
            }),
          ],
        )
      ).rows[0];
      const runId = randomUUID();
      await fixture.pool.query(
        "INSERT INTO agent_runs(id,agent,trigger,profile_id) VALUES($1,'concierge','scheduled','t08-owner')",
        [runId],
      );
      const repository = createAiDraftsRepository(
        async () => fixture.database as never,
        undefined,
        now,
      );
      const saved = await repository.saveProposedDraft(owner, {
        kind: "support",
        caseId: task.id,
        body: "Please contact staff.",
        claims: [],
        sourceRefs: [],
        ownerId: owner.profileId,
        dueAt: null,
        modelRoute: "synthetic-explicit-test-route",
        promptVersion: "t08-support-fixture-v1",
        runId,
      });
      await repository.reviewDraft(reviewer, {
        draftId: saved.id,
        expectedVersion: 1,
        decision: "approve",
      });
      const details = await repository.getDraft(owner, saved.id);
      expect(details.factsAvailable).toBe(true);
      expect(JSON.stringify(details.facts)).not.toContain(
        "synthetic@t08.example.test",
      );
      await fixture.pool.query(
        "UPDATE staff_tasks SET status='resolved' WHERE id=$1",
        [task.id],
      );
      expect((await repository.getDraft(owner, saved.id)).draft.state).toBe(
        "stale",
      );
    });
  },
);
