import {describe, expect, it, vi} from "vitest";
import {createAutomationWorker, type WorkerEnv} from "../src/index";
const revision = "a".repeat(40);
async function tick(outcome: string | null) {
  const info = vi.fn(),
    fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () =>
        new Response(null, {
          status: 200,
          headers: outcome ? {"x-hkwtia-job-outcome": outcome} : {},
        }),
    );
  const worker = createAutomationWorker({
    fetch: fetcher,
    logger: {info, error: vi.fn()},
    sleep: async () => {},
  });
  const waits: Promise<unknown>[] = [];
  const env: WorkerEnv = {
    APP_URL: "https://isolated.example.test",
    CRON_SECRET: "synthetic-cron-secret",
    AUDIT_METRICS_ENABLED: "true",
    WORKER_REVISION: revision,
  };
  worker.scheduled(
    {
      cron: "0 2 * * *",
      scheduledTime: Date.parse("2026-10-01T02:00:00Z"),
      noRetry() {},
    } as ScheduledController,
    env,
    {
      waitUntil(p) {
        waits.push(p);
      },
    } as ExecutionContext,
  );
  await Promise.all(waits);
  return {info, fetcher};
}
describe("worker success reflects completed polling", () => {
  it.each(["processing", "stale", null])(
    "does not report unresolved HTTP200 %s as a successful poll",
    async (outcome) => {
      const {info, fetcher} = await tick(outcome);
      expect(info.mock.calls[0]?.[0].outcome).toBe("unknown");
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("keeps a disabled successful route distinct from healthy work", async () => {
    const {info} = await tick("disabled");
    expect(info.mock.calls[0]?.[0].outcome).toBe("disabled");
  });
  it("reports completion only with the server's explicit completed outcome", async () => {
    const {info} = await tick("completed");
    expect(info.mock.calls[0]?.[0].outcome).toBe("accepted");
  });
  it("pins each invocation to the worker revision for server verification", async () => {
    const {fetcher} = await tick("completed");
    expect(
      new Headers(fetcher.mock.calls[0]?.[1]?.headers).get(
        "x-hkwtia-worker-revision",
      ),
    ).toBe(revision);
  });
});
it("restricts an existing cron to an explicit registered job scope, without invoking sends", async () => {
  const calls: string[] = [];
  const waits: Promise<unknown>[] = [];
  const worker = createAutomationWorker({
    fetch: async (input) => {
      calls.push(String(input));
      return new Response(null, {status: 200});
    },
    sleep: async () => {},
    logger: {error: vi.fn()},
  });
  worker.scheduled(
    {
      cron: "*/10 * * * *",
      scheduledTime: Date.now(),
      noRetry() {},
    } as ScheduledController,
    {
      APP_URL: "https://isolated.example.test",
      CRON_SECRET: "synthetic-secret",
      ...{WORKER_JOB_ALLOWLIST: "rate-limit-cleanup"},
    },
    {
      waitUntil(p) {
        waits.push(p);
      },
    } as ExecutionContext,
  );
  await Promise.all(waits);
  expect(calls.map((url) => new URL(url).pathname)).toEqual([
    "/api/jobs/rate-limit-cleanup",
  ]);
});
