// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createStaffTasksRepository } from "@/lib/db/repos/staff-tasks";
import { createWorkQueueRepository } from "@/lib/db/repos/work-queue";
import { randomUUID } from "node:crypto";
import { createInboxRepository } from "@/lib/db/repos/inbox";
import { isolatedAuditDatabase } from "./audit-database-fixture";
const conversation = "19000000-0000-4000-8000-000000000001",
  staff = {
    kind: "staff",
    profileId: "t19-staff",
    userId: "t19-auth",
  } as const;
let f: Awaited<ReturnType<typeof isolatedAuditDatabase>>,
  repo: ReturnType<typeof createInboxRepository>;
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== "1")(
  "actual support ownership and handoff",
  () => {
    beforeAll(async () => {
      f = await isolatedAuditDatabase();
      repo = createInboxRepository(async () => f.database as never);
      await f.pool.query(
        "INSERT INTO profiles(id,auth_user_id,display_name,role) VALUES('t19-staff','t19-auth','Synthetic support staff','staff'),('t19-other','t19-other-auth','Synthetic other staff','staff'),('t19-member','t19-member-auth','Synthetic member','member')",
      );
    }, 120000);
    beforeEach(async () => {
      await f.pool.query("DELETE FROM staff_tasks WHERE dedupe_key=$1", [
        "support-followup:" + conversation,
      ]);
      await f.pool.query("DELETE FROM conversations WHERE id=$1", [
        conversation,
      ]);
      await f.pool.query(
        "DELETE FROM audit_events WHERE target_type='conversation' AND target_id=$1",
        [conversation],
      );
      await f.pool.query(
        "INSERT INTO conversations(id,profile_id,channel,handling,expires_at) VALUES($1,'t19-member','whatsapp','human',now()+interval '1 day')",
        [conversation],
      );
    });
    afterAll(async () => {
      if (f) await f.close();
    });
    it("refuses a member as staff assignee without changing owner or audit", async () => {
      await expect(
        repo.assign(staff, {
          conversationId: conversation,
          assignedToProfileId: "t19-member",
          expectedAssignedToProfileId: null,
        }),
      ).rejects.toThrow("INBOX_ASSIGNEE_INVALID");
      expect(
        (
          await f.pool.query(
            "SELECT assigned_to_profile_id FROM conversations WHERE id=$1",
            [conversation],
          )
        ).rows,
      ).toEqual([{ assigned_to_profile_id: null }]);
      expect(
        (
          await f.pool.query(
            "SELECT count(*)::int AS n FROM audit_events WHERE target_id=$1",
            [conversation],
          )
        ).rows,
      ).toEqual([{ n: 0 }]);
    });
    it("serializes two first claims and refuses the stale owner expectation", async () => {
      const results = await Promise.allSettled([
        repo.assign(staff, {
          conversationId: conversation,
          assignedToProfileId: "t19-staff",
          expectedAssignedToProfileId: null,
        }),
        repo.assign(
          { ...staff, profileId: "t19-other", userId: "t19-other-auth" },
          {
            conversationId: conversation,
            assignedToProfileId: "t19-other",
            expectedAssignedToProfileId: null,
          },
        ),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        results
          .filter((r) => r.status === "rejected")
          .map((r) => (r.status === "rejected" ? r.reason.message : "")),
      ).toEqual(["INBOX_ASSIGNMENT_CONFLICT"]);
      expect(
        (
          await f.pool.query(
            "SELECT count(*)::int AS n FROM audit_events WHERE action='conversation.assigned' AND target_id=$1",
            [conversation],
          )
        ).rows,
      ).toEqual([{ n: 1 }]);
    });
    const patch = (overrides: Record<string, unknown> = {}) => ({
      conversationId: conversation,
      expectedVersion: "0",
      expectedAssignedToProfileId: null,
      ownerProfileId: "t19-staff",
      dueAt: "2040-01-02T00:00:00Z",
      nextActionCode: "await_member",
      handling: "human",
      closeReason: null,
      applicationId: null,
      billingAttemptId: null,
      supportReference: "AUTH-SYNTHETIC-001",
      handoffNote: "Synthetic handoff; waiting for document",
      ...overrides,
    });
    it("reads legacy thread ownership without creating follow-up rows", async () => {
      expect(await repo.getSupportFollowUp(staff, conversation)).toMatchObject({
        version: "0",
        ownerProfileId: null,
        dueAt: null,
        nextActionCode: "none",
        timeline: [],
      });
      expect(
        (
          await f.pool.query(
            "SELECT count(*)::int AS n FROM staff_tasks WHERE dedupe_key=$1",
            ["support-followup:" + conversation],
          )
        ).rows,
      ).toEqual([{ n: 0 }]);
    });
    it("stores owner, due, strict next step and handoff note in the existing staff task with an audit", async () => {
      const result = await repo.updateSupportFollowUp(staff, patch());
      expect(result.version).not.toBe("0");
      expect(await repo.getSupportFollowUp(staff, conversation)).toMatchObject({
        version: result.version,
        ownerProfileId: "t19-staff",
        dueAt: "2040-01-02T00:00:00Z",
        nextActionCode: "await_member",
        supportReference: "AUTH-SYNTHETIC-001",
        handoffNote: "Synthetic handoff; waiting for document",
      });
      expect(
        (
          await f.pool.query(
            "SELECT count(*)::int AS n FROM audit_events WHERE target_id=$1 AND action='conversation.support.followup.updated'",
            [conversation],
          )
        ).rows,
      ).toEqual([{ n: 1 }]);
      const tasks = await createStaffTasksRepository(
        async () => f.database as never,
      ).listOpen(staff);
      expect(
        tasks.find((task) => task.context.conversationId === conversation),
      ).toMatchObject({
        profileLabel: "Synthetic member",
        ownerLabel: "Synthetic support staff",
      });
    });
    it("rejects stale metadata, generic assignment and generic task resolution", async () => {
      const first = await repo.updateSupportFollowUp(staff, patch());
      await expect(
        repo.updateSupportFollowUp(
          staff,
          patch({ handoffNote: "Stale synthetic update" }),
        ),
      ).rejects.toThrow("SUPPORT_FOLLOWUP_CONFLICT");
      await expect(
        repo.assign(staff, {
          conversationId: conversation,
          assignedToProfileId: "t19-other",
          expectedAssignedToProfileId: "t19-staff",
        }),
      ).rejects.toThrow("SUPPORT_FOLLOWUP_REQUIRED");
      const task = (
        await f.pool.query("SELECT id FROM staff_tasks WHERE dedupe_key=$1", [
          "support-followup:" + conversation,
        ])
      ).rows[0];
      expect(task).toBeTruthy();
      await expect(
        createStaffTasksRepository(async () => f.database as never).resolve(
          staff,
          task.id,
        ),
      ).rejects.toThrow("SUPPORT_FOLLOWUP_RESOLVE_REQUIRES_VERSION");
      expect(
        (await repo.getSupportFollowUp(staff, conversation))?.version,
      ).toBe(first.version);
    });
    it("cannot close or release a versioned follow-up through legacy writers", async () => {
      const first = await repo.updateSupportFollowUp(staff, patch());
      await expect(repo.close(staff, conversation)).rejects.toThrow(
        "SUPPORT_FOLLOWUP_REQUIRED",
      );
      await expect(
        repo.setHandling(staff, {
          conversationId: conversation,
          handling: "bot",
        }),
      ).rejects.toThrow("SUPPORT_FOLLOWUP_REQUIRED");
      expect(await repo.getSupportFollowUp(staff, conversation)).toMatchObject({
        version: first.version,
        handling: "human",
      });
    });
    it("rolls back owner, metadata and history when the audit insert fails", async () => {
      await f.pool.query(
        "CREATE FUNCTION t19_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='conversation.support.followup.updated' THEN RAISE EXCEPTION 'SYNTHETIC_AUDIT_FAILURE'; END IF; RETURN NEW; END $$",
      );
      await f.pool.query(
        "CREATE TRIGGER t19_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION t19_reject_audit()",
      );
      try {
        await expect(
          repo.updateSupportFollowUp(staff, patch()),
        ).rejects.toMatchObject({
          cause: { message: "SYNTHETIC_AUDIT_FAILURE" },
        });
        expect(
          await repo.getSupportFollowUp(staff, conversation),
        ).toMatchObject({ version: "0", ownerProfileId: null, timeline: [] });
      } finally {
        await f.pool.query("DROP TRIGGER t19_audit_failure ON audit_events");
        await f.pool.query("DROP FUNCTION t19_reject_audit()");
      }
    });
    it("applies ownership and overdue scopes in SQL before the result cap", async () => {
      await repo.updateSupportFollowUp(
        staff,
        patch({ dueAt: "2020-01-01T00:00:00Z" }),
      );
      expect(
        await repo.listConversations(staff, {
          channel: "all",
          scope: "mine",
          limit: 1,
        }),
      ).toHaveLength(1);
      expect(
        await repo.listConversations(
          { ...staff, profileId: "t19-other" },
          { channel: "all", scope: "mine", limit: 1 },
        ),
      ).toHaveLength(0);
      expect(
        await repo.listConversations(staff, {
          channel: "all",
          scope: "unassigned",
          limit: 1,
        }),
      ).toHaveLength(0);
      expect(
        await repo.listConversations(staff, {
          channel: "all",
          scope: "overdue",
          limit: 1,
        }),
      ).toHaveLength(1);
      const current = (await repo.getSupportFollowUp(staff, conversation))!;
      await repo.updateSupportFollowUp(
        staff,
        patch({
          expectedVersion: current.version,
          expectedAssignedToProfileId: "t19-staff",
          handling: "closed",
          nextActionCode: "follow_up_complete",
          closeReason: "resolved",
        }),
      );
      expect(
        await repo.listConversations(staff, {
          channel: "all",
          scope: "overdue",
          limit: 1,
        }),
      ).toHaveLength(0);
    });
    it("projects one support work item with its recorded deadline and next step", async () => {
      await repo.updateSupportFollowUp(staff, patch());
      const work = await createWorkQueueRepository(
        async () => f.database,
      ).listMyWork(
        staff,
        { scope: "mine", cursor: null },
        new Date("2039-01-01"),
      );
      expect(work.items.filter((item) => item.kind === "support")).toEqual([
        expect.objectContaining({
          ownerProfileId: "t19-staff",
          nextActionCode: "await_member",
          dueAt: "2040-01-02T00:00:00.000Z",
          href: "/admin/inbox/" + conversation,
        }),
      ]);
    });
    it("keeps identical replies legal across attempts but refuses a concurrent or uncertain replay", async () => {
      const key = "inbox:" + conversation + ":" + "a".repeat(32);
      const input = {
        conversationId: conversation,
        kind: "session",
        content: "Synthetic identical reply",
        outboundKey: key,
      };
      const raced = await Promise.all([
        repo.queueStaffMessage(staff, input),
        repo.queueStaffMessage({ ...staff, profileId: "t19-other" }, input),
      ]);
      expect(raced.map((row) => row.disposition).sort()).toEqual([
        "already_queued",
        "queued",
      ]);
      await repo.settleStaffMessage(staff, {
        outboundKey: key,
        outcome: { status: "failed", errorCode: "retryable_network" },
      });
      expect((await repo.queueStaffMessage(staff, input)).disposition).toBe(
        "already_sent",
      );
      const second = {
        ...input,
        outboundKey: "inbox:" + conversation + ":" + "b".repeat(32),
      };
      expect((await repo.queueStaffMessage(staff, second)).disposition).toBe(
        "queued",
      );
      await repo.settleStaffMessage(staff, {
        outboundKey: second.outboundKey,
        outcome: { status: "sent", providerId: "synthetic-provider-accepted" },
      });
      expect(
        (await repo.getTranscript(staff, conversation))?.messages
          .map((message) => message.deliveryStatus)
          .sort(),
      ).toEqual(["failed", "sent"]);
      expect(
        (
          await f.pool.query(
            "SELECT count(*)::int AS n FROM audit_events WHERE target_id=$1 AND action='conversation.reply.queued'",
            [conversation],
          )
        ).rows,
      ).toEqual([{ n: 2 }]);
    });
    it("validates related application and billing references and audits a closed reason without financial writes", async () => {
      const application = randomUUID(),
        membership = randomUUID(),
        billing = randomUUID();
      await f.pool.query(
        "INSERT INTO membership_applications(id,applicant_user_id,plan_code,status) VALUES($1,'t19-member','startup','pending_payment')",
        [application],
      );
      await f.pool.query(
        "INSERT INTO memberships(id,owner_user_id,application_id,plan_code,status,seat_limit) VALUES($1,'t19-member',$2,'startup','pending_payment',1)",
        [membership, application],
      );
      await f.pool.query(
        "INSERT INTO billing_attempts(id,membership_id,attempt_number,idempotency_key,price_reference,state) VALUES($1,$2,1,$3,'synthetic','completed')",
        [billing, membership, "t19-" + billing],
      );
      try {
        await repo.updateSupportFollowUp(
          staff,
          patch({
            applicationId: application,
            billingAttemptId: billing,
            handling: "closed",
            nextActionCode: "follow_up_complete",
            closeReason: "escalated",
          }),
        );
        expect(
          await repo.getSupportFollowUp(staff, conversation),
        ).toMatchObject({
          applicationId: application,
          billingAttemptId: billing,
          closeReason: "escalated",
          timeline: [
            expect.objectContaining({
              context: expect.objectContaining({ closeReason: "escalated" }),
            }),
          ],
        });
        expect(
          (
            await f.pool.query("SELECT status FROM memberships WHERE id=$1", [
              membership,
            ])
          ).rows,
        ).toEqual([{ status: "pending_payment" }]);
        expect(
          (
            await f.pool.query(
              "SELECT state FROM billing_attempts WHERE id=$1",
              [billing],
            )
          ).rows,
        ).toEqual([{ state: "completed" }]);
      } finally {
        await f.pool.query("DELETE FROM billing_attempts WHERE id=$1", [
          billing,
        ]);
        await f.pool.query("DELETE FROM memberships WHERE id=$1", [membership]);
        await f.pool.query("DELETE FROM membership_applications WHERE id=$1", [
          application,
        ]);
      }
    });
    it("rejects forged references and auth-secret context instead of storing them", async () => {
      await expect(
        repo.updateSupportFollowUp(
          staff,
          patch({ applicationId: randomUUID() }),
        ),
      ).rejects.toThrow("SUPPORT_REFERENCE_INVALID");
      await expect(
        repo.updateSupportFollowUp(
          staff,
          patch({ billingAttemptId: randomUUID() }),
        ),
      ).rejects.toThrow("SUPPORT_REFERENCE_INVALID");
      await expect(
        repo.updateSupportFollowUp(
          staff,
          patch({ cookie: "synthetic-secret" }),
        ),
      ).rejects.toThrow();
      await expect(
        repo.updateSupportFollowUp(
          staff,
          patch({
            handoffNote: "https://example.test/auth?token=synthetic-secret",
          }),
        ),
      ).rejects.toThrow();
    });
    it("serializes two metadata claims and preserves history when reassigned", async () => {
      const results = await Promise.allSettled([
        repo.updateSupportFollowUp(staff, patch()),
        repo.updateSupportFollowUp(
          { ...staff, profileId: "t19-other" },
          patch({ ownerProfileId: "t19-other" }),
        ),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const current = await repo.getSupportFollowUp(staff, conversation);
      expect(current).toBeTruthy();
      const result = await repo.updateSupportFollowUp(
        staff,
        patch({
          expectedVersion: current!.version,
          expectedAssignedToProfileId: current!.ownerProfileId,
          ownerProfileId: "t19-other",
          handoffNote: "Synthetic handoff to other staff",
        }),
      );
      expect(
        (await repo.getSupportFollowUp(staff, conversation))?.timeline,
      ).toHaveLength(2);
      expect(result.version).not.toBe(current!.version);
    });
  },
);
