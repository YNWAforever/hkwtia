// @vitest-environment node
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { isolatedAuditDatabase } from "./audit-database-fixture";
import { createWorkQueueRepository } from "@/lib/admin/work-queue";
import { createAdminDashboardRepository } from "@/lib/db/repos/admin-dashboard";
const staff = {
  kind: "staff",
  profileId: "t18-staff",
  userId: "t18-auth",
} as const;
let f: Awaited<ReturnType<typeof isolatedAuditDatabase>>;
async function seedBase() {
  await f.pool.query(
    "INSERT INTO profiles(id,auth_user_id,display_name,role) VALUES ('t18-staff','t18-auth','Synthetic Staff','staff'),('t18-other','t18-other-auth','Synthetic Other','staff'),('t18-member','t18-member-auth','Synthetic Member','member')",
  );
  await f.pool.query(
    "INSERT INTO membership_applications(id,applicant_user_id,plan_code,status) VALUES ('18000000-0000-4000-8000-000000000001','t18-member','community','draft'),('18000000-0000-4000-8000-000000000002','t18-member','community','pending_review'),('18000000-0000-4000-8000-000000000003','t18-member','community','completed')",
  );
  await f.pool.query(
    "INSERT INTO staff_tasks(profile_id,kind,dedupe_key,summary_code,context) VALUES('t18-member','membership_application','membership-application:18000000-0000-4000-8000-000000000001','await_documents',$1::jsonb)",
    [
      JSON.stringify({
        applicationId: "18000000-0000-4000-8000-000000000001",
        caseVersion: "18000000-0000-4000-8000-000000000099",
        ownerProfileId: staff.profileId,
        dueAt: "2040-01-02T00:00:00Z",
        missingFields: [],
        nextActionCode: "await_documents",
      }),
    ],
  );
}
async function seedOtherSources() {
  await f.pool.query(
    "INSERT INTO membership_applications(id,applicant_user_id,plan_code,status) VALUES('18000000-0000-4000-8000-000000000010','t18-member','community','pending_payment')",
  );
  await f.pool.query(
    "INSERT INTO companies(id,legal_name,display_name) VALUES('18000000-0000-4000-8000-000000000011','Synthetic Legal','Synthetic Company')",
  );
  await f.pool.query(
    "INSERT INTO memberships(id,owner_user_id,application_id,plan_code,status,seat_limit) VALUES('18000000-0000-4000-8000-000000000012','t18-member','18000000-0000-4000-8000-000000000010','community','pending_payment',0)",
  );
  await f.pool.query(
    "INSERT INTO memberships(id,company_id,plan_code,status,seat_limit,billing_period_end) VALUES('18000000-0000-4000-8000-000000000013','18000000-0000-4000-8000-000000000011','corporate','active',10,now()+interval '10 days')",
  );
  await f.pool.query(
    "INSERT INTO billing_attempts(membership_id,attempt_number,idempotency_key,price_reference,state) VALUES('18000000-0000-4000-8000-000000000012',1,'synthetic-t18-attempt','synthetic-t18-price','completed')",
  );
  await f.pool.query(
    "INSERT INTO conversations(id,profile_id,assigned_to_profile_id,handling,expires_at) VALUES('18000000-0000-4000-8000-000000000014','t18-member','t18-staff','human',now()+interval '1 day')",
  );
  await f.pool.query(
    "INSERT INTO staff_tasks(profile_id,kind,dedupe_key,summary_code,context) VALUES('t18-member','human_followup','synthetic-t18-support','review_task','{\"conversationId\":\"18000000-0000-4000-8000-000000000014\"}')",
  );
  await f.pool.query(
    "INSERT INTO posts(id,slug,kind,title_en,title_zh,body_mdx,author) VALUES('18000000-0000-4000-8000-000000000015','synthetic-t18-news','news','Synthetic news','合成消息','Synthetic body','Synthetic Staff')",
  );
  await f.pool.query(
    "INSERT INTO page_copy_drafts(id,owner_profile_id,namespace,base_revision,revision,entries,base_entries) VALUES('18000000-0000-4000-8000-000000000016','t18-staff','Home',$1,$1,'[]','[]'),('18000000-0000-4000-8000-000000000017','t18-other','Home',$1,$1,'[]','[]')",
    ["a".repeat(64)],
  );
}

describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== "1")(
  "daily work from actual repository facts",
  () => {
    beforeAll(async () => {
      f = await isolatedAuditDatabase();
    }, 120000);
    beforeEach(async () => {
      // Only this fixture's freshly-owned loopback container; never a configured URL.
      await f.pool.query(
        "TRUNCATE profiles,companies,posts,page_copy_drafts CASCADE",
      );
      await seedBase();
    });
    afterAll(async () => {
      if (f) await f.close();
    });
    it("shows assigned unfinished applications and unassigned submitted applications distinctly", async () => {
      const repo = createWorkQueueRepository(async () => f.database);
      const mine = await repo.listMyWork(staff, {
        scope: "mine",
        cursor: null,
      });
      expect(mine.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "application",
            summary: "Synthetic Member",
            ownerProfileId: staff.profileId,
            dueAt: "2040-01-02T00:00:00.000Z",
            href: "/admin/members/queue/18000000-0000-4000-8000-000000000001",
          }),
        ]),
      );
      const unassigned = await repo.listMyWork(staff, {
        scope: "unassigned",
        cursor: null,
      });
      expect(
        unassigned.items.some((item) => item.id.endsWith("000000000002")),
      ).toBe(true);
      expect(
        unassigned.items.some((item) => item.id.endsWith("000000000003")),
      ).toBe(false);
      expect(
        unassigned.items.every((item) => item.ownerProfileId === null),
      ).toBe(true);
    });
    it("reports unfinished versus submitted application counts instead of omitting drafts", async () => {
      const counts = (await createAdminDashboardRepository(
        async () => f.database,
      ).counts(staff)) as unknown as Record<string, number | null>;
      expect(counts.unfinishedApplications).toBe(1);
      expect(counts.submittedApplications).toBe(1);
      expect(counts.profileRecords).toBe(3);
      expect(counts.activeMemberships).toBe(0);
      expect(counts.companySeats).toBe(0);
    });
    it("rejects a member before reading all work", async () => {
      let reads = 0;
      const repo = createWorkQueueRepository(async () => {
        reads++;
        return f.database as never;
      });
      await expect(
        repo.listMyWork(
          {
            kind: "member",
            profileId: "t18-member",
            userId: "t18-member-auth",
          },
          { scope: "all", cursor: null },
        ),
      ).rejects.toThrow("FORBIDDEN");
      expect(reads).toBe(0);
    });
    it("retains bounded keysets across equal microsecond timestamps and binds cursors to the actor/scope", async () => {
      const data = Array.from({ length: 48 }, (_, i) => ({
        id: `18000000-0000-4000-8000-${String(i + 1000).padStart(12, "0")}`,
      }));
      await f.pool.query(
        "INSERT INTO membership_applications(id,applicant_user_id,plan_code,status,created_at) SELECT id,'t18-member','community','draft','2050-01-01T00:00:00.123456Z'::timestamptz FROM jsonb_to_recordset($1::jsonb) AS f(id uuid)",
        [JSON.stringify(data)],
      );
      const repo = createWorkQueueRepository(async () => f.database);
      const first = await repo.listMyWork(staff, {
        scope: "all",
        cursor: null,
      });
      expect(first.items).toHaveLength(20);
      expect(first.nextCursor).not.toBeNull();
      const seen = [...first.items];
      let cursor = first.nextCursor;
      while (cursor) {
        const page = await repo.listMyWork(staff, { scope: "all", cursor });
        expect(page.items.length).toBeLessThanOrEqual(20);
        seen.push(...page.items);
        cursor = page.nextCursor;
      }
      expect(seen).toHaveLength(50);
      expect(new Set(seen.map((item) => item.id)).size).toBe(50);
      await expect(
        repo.listMyWork(staff, { scope: "mine", cursor: first.nextCursor }),
      ).rejects.toThrow("INVALID_CURSOR");
      await expect(
        repo.listMyWork(
          { ...staff, profileId: "t18-other" },
          { scope: "all", cursor: first.nextCursor },
        ),
      ).rejects.toThrow("INVALID_CURSOR");
    });

    it("projects existing payment, company renewal, human support and content without widening private drafts", async () => {
      await seedOtherSources();
      vi.stubEnv("CMS_SERVER_DRAFTS_ENABLED", "true");
      try {
        const repo = createWorkQueueRepository(async () => f.database);
        const seen = [];
        let cursor: string | null = null;
        do {
          const page = await repo.listMyWork(staff, { scope: "all", cursor });
          seen.push(...page.items);
          cursor = page.nextCursor;
        } while (cursor);
        expect(new Set(seen.map((item) => item.kind))).toEqual(
          new Set(["application", "payment", "renewal", "support", "content"]),
        );
        expect(seen.find((item) => item.kind === "payment")).toMatchObject({
          nextActionCode: "support_reconciliation",
          href: "/admin/members/queue/18000000-0000-4000-8000-000000000010",
        });
        expect(seen.find((item) => item.kind === "renewal")).toMatchObject({
          summary: "Synthetic Company",
          href: "/admin/members?companyId=18000000-0000-4000-8000-000000000011",
        });
        expect(seen.filter((item) => item.kind === "support")).toHaveLength(1);
        expect(
          seen.find((item) => item.id.endsWith("000000000016")),
        ).toMatchObject({
          ownerProfileId: staff.profileId,
          nextActionCode: "edit_private_copy",
        });
        expect(seen.some((item) => item.id.endsWith("000000000017"))).toBe(
          false,
        );
        const mine = await repo.listMyWork(staff, {
          scope: "mine",
          cursor: null,
        });
        expect(
          mine.items.every((item) => item.ownerProfileId === staff.profileId),
        ).toBe(true);
        expect(
          (
            await f.pool.query(
              "SELECT state FROM billing_attempts WHERE idempotency_key='synthetic-t18-attempt'",
            )
          ).rows[0].state,
        ).toBe("completed");
        expect(
          (
            await f.pool.query(
              "SELECT status FROM memberships WHERE id='18000000-0000-4000-8000-000000000012'",
            )
          ).rows[0].status,
        ).toBe("pending_payment");
      } finally {
        vi.unstubAllEnvs();
      }
    });
    it("surfaces a failed read and invalid scope instead of a fabricated empty work list", async () => {
      const repo = createWorkQueueRepository(async () => {
        throw Error("CONTROLLED_DB_FAILURE");
      });
      await expect(
        repo.listMyWork(staff, { scope: "all", cursor: null }),
      ).rejects.toThrow("CONTROLLED_DB_FAILURE");
      await expect(
        repo.listMyWork(staff, { scope: "unknown", cursor: null } as never),
      ).rejects.toThrow();
    });
    it("reads Member360 operational owner and payment attempt without declaring entitlement paid", async () => {
      await seedOtherSources();
      await f.pool.query(
        "INSERT INTO member_operations_metadata(profile_id,owner_profile_id) VALUES('t18-member','t18-staff')",
      );
      const repo = createWorkQueueRepository(async () => f.database);
      const maintenance = await repo.getMemberMaintenance(
        staff,
        "t18-member",
        "18000000-0000-4000-8000-000000000012",
      );
      expect(maintenance).toMatchObject({
        hasLinkedSubject: true,
        ownerName: "Synthetic Staff",
        paymentAttemptState: "completed",
        nextActionCode: "await_payment",
      });
      expect(
        (
          await f.pool.query(
            "SELECT status FROM memberships WHERE id='18000000-0000-4000-8000-000000000012'",
          )
        ).rows[0].status,
      ).toBe("pending_payment");
    });
  },
);
