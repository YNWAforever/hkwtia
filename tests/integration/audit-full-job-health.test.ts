// @vitest-environment node
import {randomUUID} from "node:crypto";
import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  assertIsolatedSeedEnvironment,
  assertSeedSentinel,
} from "@/scripts/lib/acceptance-guard";
import {createJobHealthRepository} from "@/lib/db/repos/job-health";
import {automationCronActor} from "@/lib/auth/automation-actor";
import {
  verifyWorkerHealthRequest,
  type VerifiedWorkerPoll,
} from "@/lib/jobs/worker-health-request";
import {projectJobHealth} from "@/lib/jobs/health";
import {decideWoztellDeliveryReservation} from "@/lib/db/repos/woztell-delivery-outbox";
import type {HealthJobKey} from "@/lib/jobs/health-registry";
const revision = "a".repeat(40),
  now = new Date(),
  system = automationCronActor(),
  staff = {
    kind: "staff",
    profileId: "m2-staff-01",
    userId: "synthetic-staff",
  } as const;
const keys = ["rate-limit-cleanup", "whatsapp-send-queue"],
  polls: string[] = [],
  conversation = randomUUID(),
  message = randomUUID(),
  runKey = "rate-limit-cleanup:health-test:" + randomUUID();
let pool: Pool, repo: ReturnType<typeof createJobHealthRepository>;
function poll(
  key: HealthJobKey = "rate-limit-cleanup",
  date = now,
): VerifiedWorkerPoll {
  const value = verifyWorkerHealthRequest(
    new Request("https://isolated.example.test/api/jobs/" + key, {
      method: "POST",
      headers: {
        authorization: "Bearer synthetic-secret",
        "x-hkwtia-worker-revision": revision,
      },
    }),
    key,
    "synthetic-secret",
    date,
  )!;
  polls.push(value.pollId);
  return value;
}
describe.skipIf(process.env.FULL_REMEDIATION_ACCEPTANCE_SEED !== "true")(
  "actual isolated verified job health",
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
      pool = new Pool({connectionString: url});
      await assertSeedSentinel("FULL_REMEDIATION", async () =>
        Number(
          (
            await pool.query(
              "SELECT count(*) AS count FROM acceptance_sentinel",
            )
          ).rows[0].count,
        ),
      );
      if (
        Number(
          (
            await pool.query(
              "SELECT count(*) AS count FROM job_health WHERE job_key=ANY($1)",
              [keys],
            )
          ).rows[0].count,
        ) !== 0
      )
        throw Error("HEALTH_ACCEPTANCE_ROWS_NOT_EMPTY_REVIEW_REQUIRED");
      vi.stubEnv("WORKER_HEALTH_REVISION", revision);
      repo = createJobHealthRepository(async () => drizzle(pool));
    });
    beforeEach(async () => {
      await pool.query(
        "DELETE FROM job_health WHERE job_key=ANY($1) AND poll_id=ANY($2::uuid[])",
        [keys, polls],
      );
      await pool.query("DELETE FROM jobs WHERE run_key=$1", [runKey]);
      await pool.query("DELETE FROM messages WHERE id=$1", [message]);
      await pool.query("DELETE FROM conversations WHERE id=$1", [conversation]);
    });
    afterAll(async () => {
      if (pool) {
        await pool.query(
          "DELETE FROM job_health WHERE job_key=ANY($1) AND poll_id=ANY($2::uuid[])",
          [keys, polls],
        );
        await pool.query("DELETE FROM jobs WHERE run_key=$1", [runKey]);
        await pool.query("DELETE FROM messages WHERE id=$1", [message]);
        await pool.query("DELETE FROM conversations WHERE id=$1", [
          conversation,
        ]);
        await pool.end();
      }
      vi.unstubAllEnvs();
    });
    it("GET/read does not fabricate a heartbeat and member writes fail before SQL", async () => {
      expect(await repo.read(staff, now)).toEqual([]);
      await expect(
        repo.read(
          {kind: "member", profileId: "synthetic", userId: "synthetic"},
          now,
        ),
      ).rejects.toThrow("FORBIDDEN");
      await expect(
        repo.start(
          {kind: "member", profileId: "synthetic", userId: "synthetic"},
          poll(),
        ),
      ).rejects.toThrow("FORBIDDEN");
      expect(
        (await pool.query("SELECT count(*)::int AS count FROM job_health"))
          .rows,
      ).toEqual([{count: 0}]);
    });
    it("start alone is unknown, completion with zero work is healthy and stores no arbitrary summary", async () => {
      const observation = poll();
      await repo.start(system, observation);
      const started = (await repo.read(staff, now))[0]!;
      expect(projectJobHealth(observation.jobKey, started, now).state).toBe(
        "unknown",
      );
      expect(
        await repo.finish(system, observation, "completed", now, {
          removed: 0,
          email: "sensitive@example.test",
          cookie: "synthetic-secret",
          resultRef: "synthetic-provider-ref",
        }),
      ).toBe(true);
      const current = (await repo.read(staff, now))[0]!;
      expect(projectJobHealth(observation.jobKey, current, now)).toMatchObject({
        state: "healthy",
        deploymentSha: revision,
        failedCount: 0,
        uncertainCount: 0,
      });
      expect(
        (
          await pool.query(
            "SELECT counts,error_code FROM job_health WHERE job_key=$1",
            [observation.jobKey],
          )
        ).rows,
      ).toEqual([{counts: {removed: 0}, error_code: null}]);
    });
    it("a crashed started poll becomes degraded and does not gain a last-success timestamp", async () => {
      const observation = poll();
      await repo.start(system, observation);
      const future = new Date(now.getTime() + 121000);
      const current = (await repo.read(staff, future))[0]!;
      expect(
        projectJobHealth(observation.jobKey, current, future),
      ).toMatchObject({state: "degraded", lastSucceededAt: null});
    });
    it("late settlement cannot overwrite the current worker/poll lease observation", async () => {
      const first = poll(),
        second = poll("rate-limit-cleanup", new Date(now.getTime() + 1));
      await repo.start(system, first);
      await repo.start(system, second);
      expect(
        await repo.finish(
          system,
          first,
          "completed",
          new Date(now.getTime() + 2),
        ),
      ).toBe(false);
      expect(
        await repo.finish(
          system,
          second,
          "failed",
          new Date(now.getTime() + 2),
        ),
      ).toBe(true);
      expect(
        (
          await pool.query(
            "SELECT poll_id,outcome,last_succeeded_at FROM job_health WHERE job_key='rate-limit-cleanup'",
          )
        ).rows,
      ).toEqual([
        {poll_id: second.pollId, outcome: "failed", last_succeeded_at: null},
      ]);
    });
    it("unknown duplicate/stale processing ledger remains uncertain without automatic retry", async () => {
      const observation = poll();
      await repo.start(system, observation);
      await repo.finish(system, observation, "uncertain", now);
      await pool.query(
        "INSERT INTO jobs(run_key,kind,state,updated_at) VALUES($1,'rate-limit-cleanup','processing',$2)",
        [runKey, now],
      );
      const current = (await repo.read(staff, now))[0]!;
      expect(projectJobHealth(observation.jobKey, current, now)).toMatchObject({
        state: "degraded",
        uncertainCount: 1,
      });
      expect(
        (
          await pool.query(
            "SELECT state,attempt_count FROM jobs WHERE run_key=$1",
            [runKey],
          )
        ).rows,
      ).toEqual([{state: "processing", attempt_count: 0}]);
    });
    it("accepted-timeout reservation stays visible and cannot become a resend reservation", async () => {
      const observation = poll("whatsapp-send-queue");
      await repo.start(system, observation);
      await repo.finish(system, observation, "completed", now, {sent: 0});
      await pool.query(
        "INSERT INTO conversations(id,anonymous_owner_hash,channel,expires_at) VALUES($1,$2,'whatsapp',$3)",
        [
          conversation,
          "synthetic-health-owner-" + conversation,
          new Date(now.getTime() + 3600000),
        ],
      );
      await pool.query(
        "INSERT INTO messages(id,conversation_id,role,channel,content,direction,metadata) VALUES($1,$2,'assistant','whatsapp','Synthetic uncertainty fixture','outbound',$3)",
        [
          message,
          conversation,
          JSON.stringify({
            woztellTemplateDelivery: {
              idempotencyKey: "synthetic-health-timeout",
              state: "uncertain",
              providerId: null,
            },
          }),
        ],
      );
      const current = (await repo.read(staff, now)).find(
        (row) => row.jobKey === observation.jobKey,
      )!;
      expect(projectJobHealth(observation.jobKey, current, now)).toMatchObject({
        state: "degraded",
        uncertainCount: 1,
      });
      expect(
        decideWoztellDeliveryReservation({
          state: "uncertain",
          providerId: null,
        }),
      ).toEqual({status: "uncertain"});
      expect(
        (
          await pool.query(
            "SELECT metadata->'woztellTemplateDelivery'->>'state' AS state FROM messages WHERE id=$1",
            [message],
          )
        ).rows,
      ).toEqual([{state: "uncertain"}]);
    });
    it("rejects unregistered job keys and revision changes before persistence", async () => {
      const good = poll();
      await expect(
        repo.start(system, {
          ...good,
          jobKey: "unregistered",
        } as unknown as VerifiedWorkerPoll),
      ).rejects.toThrow("UNVERIFIED_WORKER_POLL");
      vi.stubEnv("WORKER_HEALTH_REVISION", "b".repeat(40));
      await expect(repo.start(system, good)).rejects.toThrow(
        "UNVERIFIED_WORKER_POLL",
      );
      vi.stubEnv("WORKER_HEALTH_REVISION", revision);
    });
  },
);
