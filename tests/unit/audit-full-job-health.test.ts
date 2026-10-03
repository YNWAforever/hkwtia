import {readFileSync} from "node:fs";
import {afterEach, describe, expect, it, vi} from "vitest";
import {
  projectJobHealth,
  readJobHealth,
  type JobHealthSnapshot,
} from "@/lib/jobs/health";
import {
  HEALTH_JOB_KEYS,
  JOB_HEALTH_SCHEDULE,
  nextJobExpectedAt,
} from "@/lib/jobs/health-registry";
import {
  verifyWorkerHealthRequest,
  assertVerifiedWorkerPoll,
} from "@/lib/jobs/worker-health-request";
const revision = "a".repeat(40),
  now = new Date("2026-10-01T12:00:00Z"),
  env = {WORKER_HEALTH_REVISION: revision};
const row: JobHealthSnapshot = {
  jobKey: "rate-limit-cleanup",
  workerRevision: revision,
  lastStartedAt: now,
  lastSucceededAt: now,
  outcome: "completed",
  failedCount: 0,
  uncertainCount: 0,
  oldestPendingAt: null,
};
afterEach(() => vi.unstubAllEnvs());
describe("verified poll health and scheduling", () => {
  it("missing heartbeat or different deployed revision is unknown, never healthy", () => {
    expect(projectJobHealth(row.jobKey, null, now, env).state).toBe("unknown");
    expect(
      projectJobHealth(
        row.jobKey,
        {...row, workerRevision: "b".repeat(40)},
        now,
        env,
      ).state,
    ).toBe("unknown");
  });
  it("successful empty polling is healthy but start alone is not success", () => {
    expect(projectJobHealth(row.jobKey, row, now, env).state).toBe("healthy");
    expect(
      projectJobHealth(
        row.jobKey,
        {...row, lastSucceededAt: null, outcome: "processing"},
        now,
        env,
      ).state,
    ).toBe("unknown");
  });
  it("explicit feature disable is distinct from failure or missing observation", () => {
    expect(projectJobHealth("admin-batches", null, now, env).state).toBe(
      "disabled",
    );
    expect(
      projectJobHealth("admin-batches", null, now, {
        ...env,
        ADMIN_BATCH_ENABLED: "true",
      }).state,
    ).toBe("unknown");
  });
  it("expected cron plus grace separates a recent poll from an expired one", () => {
    expect(
      projectJobHealth(row.jobKey, row, new Date("2026-10-01T12:12:00Z"), env)
        .state,
    ).toBe("healthy");
    expect(
      projectJobHealth(
        row.jobKey,
        row,
        new Date("2026-10-01T12:12:00.001Z"),
        env,
      ).state,
    ).toBe("degraded");
  });
  it.each(["failed", "uncertain"])(
    "does not turn %s into healthy or retry authority",
    (outcome) => {
      expect(
        projectJobHealth(row.jobKey, {...row, outcome}, now, env).state,
      ).toBe("degraded");
    },
  );
  it("partial failures and accepted-timeout counts remain visible", () => {
    expect(
      projectJobHealth(row.jobKey, {...row, uncertainCount: 1}, now, env),
    ).toMatchObject({state: "degraded", uncertainCount: 1});
    expect(
      projectJobHealth(row.jobKey, {...row, failedCount: 2}, now, env),
    ).toMatchObject({state: "degraded", failedCount: 2});
  });
  it("a future success or corrupt count cannot fabricate healthy evidence", () => {
    expect(
      projectJobHealth(
        row.jobKey,
        {
          ...row,
          lastStartedAt: new Date(now.getTime() + 3600000),
          lastSucceededAt: new Date(now.getTime() + 3600000),
        },
        now,
        env,
      ).state,
    ).toBe("unknown");
    expect(
      projectJobHealth(row.jobKey, {...row, failedCount: NaN}, now, env).state,
    ).toBe("unknown");
  });
  it("monthly and UTC/HKT day edges use actual registered cron times", () => {
    expect(
      nextJobExpectedAt(
        "board-reporter",
        new Date("2026-10-01T00:30:00Z"),
      ).toISOString(),
    ).toBe("2026-11-01T00:30:00.000Z");
    expect(
      nextJobExpectedAt(
        "renewal-runner",
        new Date("2026-10-01T16:30:00Z"),
      ).toISOString(),
    ).toBe("2026-10-02T02:00:00.000Z");
  });
  it("covers every existing worker job and its real cron, with minimum discovery", () => {
    const source = readFileSync("workers/src/index.ts", "utf8");
    const declaration = source.match(
      /export const WORKER_JOBS = \[([\s\S]*?)\]\s*as const;/,
    )![1]!;
    const keys = [...declaration.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    expect(keys.length).toBeGreaterThanOrEqual(17);
    expect([...HEALTH_JOB_KEYS].sort()).toEqual(keys.sort());
    for (const key of HEALTH_JOB_KEYS)
      for (const cron of JOB_HEALTH_SCHEDULE[key].crons)
        expect(source).toContain('"' + cron + '"');
  });
  it("verifies own bearer and exact pinned SHA; no metadata for hostile callers", () => {
    vi.stubEnv("WORKER_HEALTH_REVISION", revision);
    const request = (bearer: string, rev: string) =>
      new Request("https://isolated.example.test/api/jobs/rate-limit-cleanup", {
        method: "POST",
        headers: {authorization: bearer, "x-hkwtia-worker-revision": rev},
      });
    for (const [bearer, rev] of [
      ["Bearer wrong", revision],
      ["Bearer synthetic-secret", "b".repeat(40)],
      ["Bearer synthetic-secret", "a".repeat(7)],
    ] as const)
      expect(
        verifyWorkerHealthRequest(
          request(bearer, rev),
          row.jobKey,
          "synthetic-secret",
          now,
        ),
      ).toBeNull();
    const poll = verifyWorkerHealthRequest(
      request("Bearer synthetic-secret", revision),
      row.jobKey,
      "synthetic-secret",
      now,
    )!;
    expect(() => assertVerifiedWorkerPoll(poll)).not.toThrow();
    expect(() =>
      assertVerifiedWorkerPoll(JSON.parse(JSON.stringify(poll))),
    ).toThrow("UNVERIFIED_WORKER_POLL");
  });
  it("member cannot read admin health even when no worker is configured", async () => {
    const reader = {read: vi.fn(async () => [])};
    await expect(
      readJobHealth(
        {kind: "member", profileId: "synthetic", userId: "synthetic"},
        reader,
        now,
      ),
    ).rejects.toThrow("FORBIDDEN");
    expect(reader.read).not.toHaveBeenCalled();
  });
});
