import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertIsolatedSeedEnvironment,
  assertSeedSentinel,
} from "@/scripts/lib/acceptance-guard";
import {
  createRenewalEnrollmentsRepository,
  type RenewalEnrollmentCandidate,
} from "@/lib/db/repos/renewal-enrollments";
import {
  createJourneysRepository,
  type JourneyEnrollment,
} from "@/lib/db/repos/journeys";
import {
  automationCronActor,
  type AutomationRepositoryActor,
} from "@/lib/auth/automation-actor";
import { runRenewalReconciliation } from "@/lib/automation/renewal-runner";
import { scheduleWebhookLifecycleEnrollment } from "@/lib/automation/enrollment";
import { scheduleJourney } from "@/lib/automation/schedule";
import { renewalInstanceKey } from "@/lib/automation/renewal-window";
import { addHongKongDays } from "@/lib/automation/hong-kong-time";

type TestActor = AutomationRepositoryActor;
type Cursor = { billingPeriodEnd: Date; membershipId: string };
type Query = {
  from: Date;
  to: Date;
  statuses: readonly ("active" | "past_due")[];
  after: Cursor | null;
  limit: number;
};
type Page = { items: RenewalEnrollmentCandidate[]; nextCursor: Cursor | null };
const now = new Date("2040-01-01T16:00:00.000Z"),
  from = now,
  to = addHongKongDays(from, 91),
  actor = automationCronActor(),
  prefix = "t12-renewal-" + randomUUID(),
  unownedCompany = randomUUID();
const fixture = Array.from({ length: 5000 }, (_, index) => ({
  id: randomUUID(),
  profile: prefix + ":" + index,
  status: index % 2 ? "past_due" : "active",
  end: addHongKongDays(from, 30),
  interval: "annual",
  cancel: false,
}));
const extras = [
  { status: "active", end: from, interval: "annual", cancel: false },
  {
    status: "past_due",
    end: new Date(to.getTime() - 1),
    interval: "annual",
    cancel: false,
  },
  { status: "active", end: to, interval: "annual", cancel: false },
  {
    status: "active",
    end: new Date(from.getTime() - 1),
    interval: "annual",
    cancel: false,
  },
  {
    status: "cancelled",
    end: addHongKongDays(from, 30),
    interval: "annual",
    cancel: false,
  },
  {
    status: "expired",
    end: addHongKongDays(from, 30),
    interval: "annual",
    cancel: false,
  },
  {
    status: "active",
    end: addHongKongDays(from, 30),
    interval: "annual",
    cancel: false,
    grant: true,
  },
  {
    status: "active",
    end: addHongKongDays(from, 30),
    interval: "none",
    cancel: false,
  },
  {
    status: "active",
    end: addHongKongDays(from, 30),
    interval: "annual",
    cancel: true,
  },
  { status: "active", end: null, interval: "annual", cancel: false },
  {
    status: "active",
    end: addHongKongDays(from, 1),
    interval: "annual",
    cancel: false,
    noOwner: true,
  },
].map((value, index) => ({
  ...value,
  id: randomUUID(),
  profile: prefix + ":edge:" + index,
}));
const all = [...fixture, ...extras],
  ids = all.map((row) => row.id),
  profiles = all.map((row) => row.profile),
  expected: string[] = [...fixture, extras[0]!, extras[1]!].map(
    (row) => row.id,
  );
let pool: Pool,
  repo: ReturnType<typeof createRenewalEnrollmentsRepository>,
  journeys: ReturnType<typeof createJourneysRepository>;
const commands: { sql: string; params: unknown[] }[] = [],
  dialect = new PgDialect(),
  receipt: Record<string, unknown> = {
    environment:
      "confirmed isolated Neon; synthetic2040 dates, no provider/sends",
    production: false,
  };
const query = (after: Cursor | null = null, limit = 250): Query => ({
  from,
  to,
  statuses: ["active", "past_due"],
  after,
  limit,
});
// The baseline returns an unbounded legacy array. Normalize only here to measure its actual over-read.
async function page(input: Query): Promise<Page> {
  const result: unknown = await (
    repo.listDue as unknown as (
      actor: TestActor,
      input: Query,
    ) => Promise<unknown>
  )(actor, input);
  return Array.isArray(result)
    ? { items: result, nextCursor: null }
    : (result as Page);
}
function cleanPlan(value: unknown): unknown {
  if (typeof value === "string")
    return value.replace(
      /[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/gi,
      "[synthetic-id]",
    );
  if (Array.isArray(value)) return value.map(cleanPlan);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cleanPlan(item)]),
    );
  return value;
}

describe.skipIf(process.env.FULL_REMEDIATION_ACCEPTANCE_SEED !== "true")(
  "bounded renewal window on actual isolated SQL",
  () => {
    beforeAll(async () => {
      const url = assertIsolatedSeedEnvironment(process.env, {
        prefix: "FULL_REMEDIATION",
        flag: "FULL_REMEDIATION_ACCEPTANCE_SEED",
        hostAllowlistVar: "FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST",
      });
      if (
        new URL(url).hostname !==
          "ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech" ||
        process.env.NEON_PROJECT_ID !== "solitary-wave-52860119"
      )
        throw Error("UNCONFIRMED_ISOLATED_TARGET");
      pool = new Pool({ connectionString: url });
      await assertSeedSentinel("FULL_REMEDIATION", async () =>
        Number(
          (
            await pool.query(
              "SELECT count(*) AS count FROM acceptance_sentinel",
            )
          ).rows[0].count,
        ),
      );
      await pool.query(
        "INSERT INTO profiles(id,auth_user_id,email,display_name,directory_visible,consent_marketing,whatsapp_opt_in) SELECT id,id,id||'@synthetic.example.test','Synthetic renewal fixture',false,false,false FROM unnest($1::text[]) id",
        [profiles],
      );
      await pool.query(
        "INSERT INTO companies(id,legal_name,display_name) VALUES($1,'Synthetic unowned renewal','Synthetic unowned renewal')",
        [unownedCompany],
      );
      await pool.query(
        "INSERT INTO memberships(id,owner_user_id,company_id,plan_code,status,seat_limit,billing_interval,billing_period_end,cancel_at_period_end,grant_effective_at,grant_expires_at,grant_reason,grant_actor_profile_id) SELECT id::uuid,profile,company_id::uuid,'startup',status::membership_status,1,interval::billing_interval,end_at::timestamptz,cancel,grant_from::timestamptz,grant_to::timestamptz,grant_reason,grant_actor FROM jsonb_to_recordset($1::jsonb) AS f(id text,profile text,company_id text,status text,interval text,end_at text,cancel boolean,grant_from text,grant_to text,grant_reason text,grant_actor text)",
        [
          JSON.stringify(
            all.map((row) => ({
              id: row.id,
              profile: "noOwner" in row && row.noOwner ? null : row.profile,
              company_id:
                "noOwner" in row && row.noOwner ? unownedCompany : null,
              status: row.status,
              interval: row.interval,
              end_at: row.end?.toISOString() ?? null,
              cancel: row.cancel,
              grant_from:
                "grant" in row && row.grant ? from.toISOString() : null,
              grant_to: "grant" in row && row.grant ? to.toISOString() : null,
              grant_reason:
                "grant" in row && row.grant
                  ? "Synthetic finite grant boundary"
                  : null,
              grant_actor:
                "grant" in row && row.grant ? "m2-superadmin-01" : null,
            })),
          ),
        ],
      );
      repo = createRenewalEnrollmentsRepository(async () => ({
        execute: async (sql: SQL) => {
          const command = dialect.sqlToQuery(sql);
          commands.push(command);
          return drizzle(pool).execute(sql);
        },
      }));
      journeys = createJourneysRepository(async () => drizzle(pool));
      receipt.indexPresent =
        (
          await pool.query(
            "SELECT indexname FROM pg_indexes WHERE tablename='memberships' AND indexname='memberships_renewal_window_idx'",
          )
        ).rows.length === 1;
      receipt.fixtureCount = all.length;
      receipt.expectedWindowCount = expected.length;
      // Benchmark a known fixture distribution rather than stale pre-seed estimates.
      await pool.query("ANALYZE memberships");
      await pool.query("ANALYZE membership_applications");
      await pool.query("ANALYZE journey_state");
      receipt.statisticsRefreshedAfterSeed = true;
      receipt.originalAllPeriodPlan = cleanPlan(
        (
          await pool.query(
            "EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) SELECT id,billing_period_end FROM memberships WHERE billing_period_end IS NOT NULL ORDER BY id",
          )
        ).rows[0]["QUERY PLAN"],
      );
    }, 120000);
    beforeEach(async () => {
      commands.length = 0;
      await pool.query(
        "DELETE FROM journey_state WHERE membership_id=ANY($1::uuid[])",
        [ids],
      );
    });
    afterAll(async () => {
      if (pool) {
        await pool.query(
          "DELETE FROM journey_state WHERE membership_id=ANY($1::uuid[])",
          [ids],
        );
        await pool.query("DELETE FROM memberships WHERE id=ANY($1::uuid[])", [
          ids,
        ]);
        await pool.query("DELETE FROM profiles WHERE id=ANY($1::text[])", [
          profiles,
        ]);
        await pool.query("DELETE FROM companies WHERE id=$1", [unownedCompany]);
        await pool.end();
      }
      const directory =
        "docs/audits/hkwtia-2026-10-01-remediation/evidence/t12";
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(
        directory + "/renewal-window.json",
        JSON.stringify(receipt, null, 2),
      );
    });
    it("bounds each page and excludes out-of-window/terminal/free/granted/cancelled renewal rows", async () => {
      const first = await page(query());
      expect(first.items.length).toBeLessThanOrEqual(250);
      expect(first.items.length).toBe(250);
      expect(first.nextCursor).not.toBeNull();
      expect(
        first.items.every((row) => expected.includes(row.membershipId)),
      ).toBe(true);
      const command = commands[0]!;
      receipt[
        receipt.indexPresent
          ? "boundedPlanAfterIndex"
          : "boundedPlanBeforeIndex"
      ] = cleanPlan(
        (
          await pool.query(
            "EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) " + command.sql,
            command.params,
          )
        ).rows[0]["QUERY PLAN"],
      );
      const plan =
        receipt[
          receipt.indexPresent
            ? "boundedPlanAfterIndex"
            : "boundedPlanBeforeIndex"
        ];
      const scans: Record<string, unknown>[] = [];
      function walk(value: unknown): void {
        if (Array.isArray(value)) {
          value.forEach(walk);
          return;
        }
        if (!value || typeof value !== "object") return;
        const node = value as Record<string, unknown>;
        if (node["Relation Name"] === "memberships") scans.push(node);
        Object.values(node).forEach(walk);
      }
      walk(plan);
      expect(scans.length).toBeGreaterThan(0);
      if (receipt.indexPresent) {
        expect(
          scans.reduce((sum, scan) => sum + Number(scan["Actual Rows"]), 0),
        ).toBeLessThanOrEqual(252);
      }
    });
    it("does not repeatedly select an unowned membership that cannot obtain a durable journey checkpoint", async () => {
      const result = await page({ ...query(), to: addHongKongDays(from, 2) });
      expect(result.items.map((row) => row.membershipId)).toEqual([
        extras[0]!.id,
      ]);
      expect(result.items.every((row) => row.profileId !== null)).toBe(true);
    });
    it("keysets5000 same-timestamp rows without missing or duplicating IDs at50/500 limits", async () => {
      for (const limit of [50, 500]) {
        const seen: string[] = [];
        let after: Cursor | null = null,
          pages = 0;
        do {
          const current = await page(query(after, limit));
          expect(current.items.length).toBeLessThanOrEqual(limit);
          seen.push(...current.items.map((row) => row.membershipId));
          after = current.nextCursor;
          if (++pages > 110) throw Error("UNBOUNDED_RENEWAL_PAGINATION");
        } while (after);
        expect(seen.length).toBe(expected.length);
        expect(new Set(seen)).toEqual(new Set(expected));
        receipt["pagesAt" + limit] = pages;
      }
    }, 120000);
    it("rejects an untrusted actor or invalid bounds before opening a database", async () => {
      const repository = createRenewalEnrollmentsRepository(async () => {
        throw Error("DATABASE_SHOULD_NOT_OPEN");
      });
      const call = repository.listDue as unknown as (
        actor: unknown,
        input: unknown,
      ) => Promise<unknown>;
      await expect(
        call(
          { kind: "system", userId: null, source: "stripe-webhook" },
          query(),
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      for (const change of [
        { limit: 0 },
        { limit: 501 },
        { from: new Date("invalid") },
        { to: from },
        { statuses: [] },
        { statuses: ["unregistered"] },
        { after: { billingPeriodEnd: from, membershipId: "not-a-uuid" } },
      ])
        await expect(call(actor, { ...query(), ...change })).rejects.toThrow(
          "INVALID_RENEWAL_WINDOW",
        );
    });
    it("recovers from interruption after a durable page without duplicate enrolment or provider effects", async () => {
      const actual = journeys as unknown as {
        enrollRenewalPage(
          actor: TestActor,
          steps: readonly JourneyEnrollment[],
        ): Promise<{ created: number; existing: number; skipped: number }>;
        enroll: typeof journeys.enroll;
      };
      let batches = 0;
      const dependencies = {
        renewals: repo,
        journeys: {
          ...journeys,
          enrollRenewalPage: async (
            ...args: Parameters<typeof actual.enrollRenewalPage>
          ) => {
            if (++batches === 2)
              throw Error("SYNTHETIC_INTERRUPTION_AFTER_CHECKPOINT");
            return actual.enrollRenewalPage(...args);
          },
        },
      };
      await expect(
        runRenewalReconciliation(actor, now, dependencies),
      ).rejects.toThrow("SYNTHETIC_INTERRUPTION_AFTER_CHECKPOINT");
      const committed = Number(
        (
          await pool.query(
            "SELECT count(*) AS count FROM journey_state WHERE membership_id=ANY($1::uuid[])",
            [ids],
          )
        ).rows[0].count,
      );
      expect(committed).toBeGreaterThan(0);
      expect(committed % 4).toBe(0);
      let recoveryCreated = 0,
        polls = 0;
      do {
        const recovery = await runRenewalReconciliation(actor, now, {
          renewals: repo,
          journeys,
        });
        recoveryCreated += recovery.createdSteps;
        if (++polls > 25) throw Error("CHECKPOINT_DID_NOT_CONVERGE");
        if (!("deferred" in recovery) || !recovery.deferred) break;
      } while (true);
      const total = Number(
        (
          await pool.query(
            "SELECT count(*) AS count FROM journey_state WHERE membership_id=ANY($1::uuid[])",
            [ids],
          )
        ).rows[0].count,
      );
      expect(total).toBe(expected.length * 4);
      expect(recoveryCreated).toBe(total - committed);
      expect(
        await runRenewalReconciliation(actor, now, {
          renewals: repo,
          journeys,
        }),
      ).toMatchObject({ scanned: 0, createdSteps: 0 });
      expect(
        (
          await pool.query(
            "SELECT count(*) AS count FROM email_log WHERE profile_id=ANY($1::text[])",
            [profiles],
          )
        ).rows[0].count,
      ).toBe("0");
      receipt.checkpoint = {
        committedBeforeInterruption: committed,
        recoveryCreated,
        polls,
        total,
        duplicateRunScanned: 0,
        noProviderEffects: true,
      };
    }, 120000);
    it("rechecks a changed billing period/cancellation before the batch checkpoint is written", async () => {
      const candidate = fixture[0]!;
      const steps = [
        "renewal_90",
        "renewal_60",
        "renewal_30",
        "renewal_14",
      ].map((step) => ({
        profileId: candidate.profile,
        membershipId: candidate.id,
        journey: "renewal" as const,
        instanceKey:
          "period:" + candidate.id + ":" + candidate.end.toISOString(),
        step,
        scheduledAt: addHongKongDays(candidate.end, -14),
        deliveryKey:
          "journey:" +
          candidate.profile +
          ":renewal:period:" +
          candidate.id +
          ":" +
          candidate.end.toISOString() +
          ":" +
          step,
      }));
      const writer = journeys as unknown as {
        enrollRenewalPage(
          actor: TestActor,
          steps: readonly JourneyEnrollment[],
        ): Promise<{ created: number; existing: number; skipped: number }>;
      };
      try {
        await pool.query(
          "UPDATE memberships SET billing_period_end=$2 WHERE id=$1",
          [candidate.id, addHongKongDays(candidate.end, 365)],
        );
        expect(await writer.enrollRenewalPage(actor, steps)).toEqual({
          created: 0,
          existing: 0,
          skipped: 4,
        });
        await pool.query(
          "UPDATE memberships SET billing_period_end=$2,status='cancelled' WHERE id=$1",
          [candidate.id, candidate.end],
        );
        expect(await writer.enrollRenewalPage(actor, steps)).toEqual({
          created: 0,
          existing: 0,
          skipped: 4,
        });
        expect(
          Number(
            (
              await pool.query(
                "SELECT count(*) AS count FROM journey_state WHERE membership_id=$1",
                [candidate.id],
              )
            ).rows[0].count,
          ),
        ).toBe(0);
      } finally {
        await pool.query(
          "UPDATE memberships SET billing_period_end=$2,status=$3 WHERE id=$1",
          [candidate.id, candidate.end, candidate.status],
        );
      }
    });
    it("keeps concurrent checkpoints idempotent and rolls back the whole SQL statement on a constraint fault", async () => {
      const candidate = fixture[0]!;
      const steps = scheduleJourney({
        journey: "renewal",
        profileId: candidate.profile,
        membershipId: candidate.id,
        anchor: candidate.end,
        instanceKey: renewalInstanceKey(candidate.id, candidate.end),
      });
      // A controlled NOT NULL fault proves partial inserts cannot survive this page statement.
      const broken = steps.map((step, index) =>
        index === 2
          ? { ...step, deliveryKey: null as unknown as string }
          : step,
      );
      await expect(
        journeys.enrollRenewalPage(actor, broken),
      ).rejects.toMatchObject({ cause: { code: "23502" } });
      expect(
        Number(
          (
            await pool.query(
              "SELECT count(*) AS count FROM journey_state WHERE membership_id=$1",
              [candidate.id],
            )
          ).rows[0].count,
        ),
      ).toBe(0);
      const results = await Promise.all([
        journeys.enrollRenewalPage(actor, steps),
        journeys.enrollRenewalPage(actor, steps),
      ]);
      expect(results.reduce((sum, result) => sum + result.created, 0)).toBe(4);
      expect(results.reduce((sum, result) => sum + result.existing, 0)).toBe(4);
      expect(results.every((result) => result.skipped === 0)).toBe(true);
      expect(
        Number(
          (
            await pool.query(
              "SELECT count(*) AS count FROM journey_state WHERE membership_id=$1",
              [candidate.id],
            )
          ).rows[0].count,
        ),
      ).toBe(4);
      receipt.concurrentCheckpoint = {
        created: 4,
        existing: 4,
        persisted: 4,
        constraintFaultPersisted: 0,
      };
    });
    it("preserves scoped legacy/uncertain steps while creating only missing new episode steps", async () => {
      const candidate = fixture[0]!,
        base = {
          journey: "renewal" as const,
          profileId: candidate.profile,
          membershipId: candidate.id,
          anchor: candidate.end,
        };
      const legacy = scheduleJourney({
        ...base,
        instanceKey: "period:" + candidate.end.toISOString(),
      });
      await journeys.enroll(actor, legacy[0]!);
      await pool.query(
        "UPDATE journey_state SET status='failed',error_code='provider_acceptance_uncertain' WHERE membership_id=$1 AND step=$2",
        [candidate.id, legacy[0]!.step],
      );
      const current = scheduleJourney({
        ...base,
        instanceKey: renewalInstanceKey(candidate.id, candidate.end),
      });
      expect(await journeys.enrollRenewalPage(actor, current)).toEqual({
        created: 3,
        existing: 1,
        skipped: 0,
      });
      expect(await journeys.enrollRenewalPage(actor, current)).toEqual({
        created: 0,
        existing: 4,
        skipped: 0,
      });
      const rows = (
        await pool.query(
          "SELECT step,status,error_code FROM journey_state WHERE membership_id=$1",
          [candidate.id],
        )
      ).rows;
      expect(rows.length).toBe(4);
      expect(new Set(rows.map((row) => row.step)).size).toBe(4);
      expect(rows.find((row) => row.step === legacy[0]!.step)).toMatchObject({
        status: "failed",
        error_code: "provider_acceptance_uncertain",
      });
    });
    it("blocks an older writer from duplicating a new renewal episode even after rescheduling", async () => {
      const candidate = fixture[0]!,
        base = {
          journey: "renewal" as const,
          profileId: candidate.profile,
          membershipId: candidate.id,
          anchor: candidate.end,
        };
      const current = scheduleJourney({
        ...base,
        instanceKey: renewalInstanceKey(candidate.id, candidate.end),
      });
      expect(await journeys.enrollRenewalPage(actor, current)).toEqual({
        created: 4,
        existing: 0,
        skipped: 0,
      });
      await pool.query(
        "UPDATE journey_state SET scheduled_at=scheduled_at+interval '1 minute',status='failed',error_code='provider_acceptance_uncertain' WHERE membership_id=$1 AND step=$2",
        [candidate.id, current[0]!.step],
      );
      const older = scheduleJourney({
        ...base,
        instanceKey: "period:" + candidate.end.toISOString(),
      });
      expect(await journeys.enroll(actor, older[0]!)).toBe("existing");
      expect(
        Number(
          (
            await pool.query(
              "SELECT count(*) AS count FROM journey_state WHERE membership_id=$1",
              [candidate.id],
            )
          ).rows[0].count,
        ),
      ).toBe(4);
    });
    it("persists independent personal/company episodes for the same applicant and billing period", async () => {
      const candidate = fixture[0]!,
        company = randomUUID(),
        application = randomUUID(),
        membership = randomUUID();
      try {
        await pool.query(
          "INSERT INTO companies(id,legal_name,display_name) VALUES($1,'Synthetic renewal company','Synthetic renewal company')",
          [company],
        );
        await pool.query(
          "INSERT INTO membership_applications(id,applicant_user_id,plan_code,company_id,status,current_step) VALUES($1,$2,'corporate',$3,'completed','complete')",
          [application, candidate.profile, company],
        );
        await pool.query(
          "INSERT INTO memberships(id,company_id,application_id,plan_code,status,seat_limit,billing_period_end) VALUES($1,$2,$3,'corporate','active',12,$4)",
          [membership, company, application, candidate.end],
        );
        const steps = [candidate.id, membership].flatMap((id) =>
          scheduleJourney({
            journey: "renewal",
            profileId: candidate.profile,
            membershipId: id,
            anchor: candidate.end,
            instanceKey: renewalInstanceKey(id, candidate.end),
          }),
        );
        expect(await journeys.enrollRenewalPage(actor, steps)).toEqual({
          created: 8,
          existing: 0,
          skipped: 0,
        });
        expect(await journeys.enrollRenewalPage(actor, steps)).toEqual({
          created: 0,
          existing: 8,
          skipped: 0,
        });
        const rows = (
          await pool.query(
            "SELECT membership_id,instance_key FROM journey_state WHERE membership_id=ANY($1::uuid[])",
            [[candidate.id, membership]],
          )
        ).rows;
        expect(rows.length).toBe(8);
        expect(new Set(rows.map((row) => row.instance_key)).size).toBe(2);
        expect(new Set(rows.map((row) => row.membership_id)).size).toBe(2);
      } finally {
        await pool.query("DELETE FROM journey_state WHERE membership_id=$1", [
          membership,
        ]);
        await pool.query("DELETE FROM memberships WHERE id=$1", [membership]);
        await pool.query("DELETE FROM membership_applications WHERE id=$1", [
          application,
        ]);
        await pool.query("DELETE FROM companies WHERE id=$1", [company]);
      }
    });
    it("preserves separate trusted dunning/winback episodes and never treats terminal renewal exclusion as loss of winback", () => {
      const input = {
        membershipId: ids[0]!,
        profileId: profiles[0]!,
        eventId: "evt_synthetic_t12",
        eventCreated: Math.floor(now.getTime() / 1000),
      };
      expect(
        scheduleWebhookLifecycleEnrollment({
          ...input,
          nextStatus: "past_due",
        }).map((row) => row.step),
      ).toEqual(["dunning_0", "dunning_3", "dunning_7", "lapsed"]);
      expect(
        scheduleWebhookLifecycleEnrollment({
          ...input,
          nextStatus: "cancelled",
        }).map((row) => row.step),
      ).toEqual(["winback_7", "winback_21", "winback_60"]);
    });
  },
);
