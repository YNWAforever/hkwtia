import {describe, expect, it, vi} from "vitest";

import {
  createAutomationWorker,
  type AutomationWorker,
  type WorkerDependencies,
  type WorkerEnv,
} from "../src/index";

const DEFAULT_ENV: WorkerEnv = {
  APP_URL: "https://app.example.test",
  CRON_SECRET: "cron-test-secret",
};
const SCHEDULED_TIME = Date.parse("2026-07-26T02:00:00.123Z");

type RecordedRequest = Readonly<{
  url: string;
  init: RequestInit | undefined;
}>;

function requestUrl(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : String(input);
}

function jobName(url: string): string {
  return new URL(url).pathname.split("/").at(-1) ?? "";
}

function createFetch(
  calls: RecordedRequest[],
  respond: (
    url: string,
    init: RequestInit | undefined,
  ) => Response | Promise<Response>,
): WorkerDependencies["fetch"] {
  return (async (input, init) => {
    const url = requestUrl(input);
    calls.push({url, init});
    return respond(url, init);
  }) as WorkerDependencies["fetch"];
}

async function runScheduled(
  worker: AutomationWorker,
  options: Readonly<{
    cron?: string;
    env?: WorkerEnv;
    scheduledTime?: number;
  }> = {},
): Promise<void> {
  const waits: Promise<unknown>[] = [];
  const ctx = {
    waitUntil(promise: Promise<unknown>) {
      waits.push(promise);
    },
  } as ExecutionContext;
  const controller = {
    cron: options.cron ?? "0 * * * *",
    scheduledTime: options.scheduledTime ?? SCHEDULED_TIME,
    noRetry() {},
  } as ScheduledController;

  expect(
    worker.scheduled(controller, options.env ?? DEFAULT_ENV, ctx),
  ).toBeUndefined();
  expect(waits).toHaveLength(1);
  await Promise.all(waits);
}

function guardedFailureResponse(): Response {
  const response = new Response("sensitive response body", {
    status: 503,
    headers: {"x-sensitive": "sensitive response header"},
  });
  const forbidden = new Set(["body", "headers", "status", "statusText"]);
  return new Proxy(response, {
    get(target, property) {
      if (forbidden.has(String(property))) {
        throw new Error(`response ${String(property)} must not be read`);
      }
      return Reflect.get(target, property, target) as unknown;
    },
  });
}

describe("Cloudflare automation scheduler", () => {
  it.each([
    ["0 * * * *", ["approvals-expirer", "journey-runner"]],
    [
      "0 2 * * *",
      ["approvals-expirer", "journey-runner", "renewal-runner"],
    ],
    [
      "0 18 * * *",
      ["approvals-expirer", "engagement-score", "journey-runner"],
    ],
  ] as const)(
    "maps %s to every due job once, including overlapping hourly work",
    async (cron, expectedJobs) => {
      const calls: RecordedRequest[] = [];
      const worker = createAutomationWorker({
        fetch: createFetch(calls, () => new Response(null, {status: 204})),
        sleep: async () => {},
        logger: {error: vi.fn()},
      });

      await runScheduled(worker, {cron});

      const actualJobs = calls.map((call) => jobName(call.url)).sort();
      expect(actualJobs).toEqual([...expectedJobs]);
      expect(new Set(actualJobs).size).toBe(actualJobs.length);
    },
  );

  it("registers one waitUntil promise and settles every due job independently", async () => {
    const calls: RecordedRequest[] = [];
    const worker = createAutomationWorker({
      fetch: createFetch(calls, (url) => {
        if (url.endsWith("/journey-runner")) {
          throw new Error("journey endpoint unavailable");
        }
        return new Response(null, {status: 204});
      }),
      sleep: async () => {},
      logger: {error: vi.fn()},
    });

    await runScheduled(worker);

    expect(
      calls.filter((call) => call.url.endsWith("/journey-runner")),
    ).toHaveLength(3);
    expect(
      calls.filter((call) => call.url.endsWith("/approvals-expirer")),
    ).toHaveLength(1);
    expect(
      calls.filter((call) => call.url.endsWith("/worker-alert")),
    ).toHaveLength(1);
  });

  it("joins APP_URL canonically and invokes jobs with bearer POST and no body", async () => {
    const calls: RecordedRequest[] = [];
    const worker = createAutomationWorker({
      fetch: createFetch(calls, () => new Response(null, {status: 204})),
      sleep: async () => {},
      logger: {error: vi.fn()},
    });

    await runScheduled(worker, {
      env: {
        APP_URL: "https://app.example.test/base///",
        CRON_SECRET: "exact bearer secret",
      },
    });

    expect(calls.map((call) => call.url).sort()).toEqual([
      "https://app.example.test/base/api/jobs/approvals-expirer",
      "https://app.example.test/base/api/jobs/journey-runner",
    ]);
    for (const call of calls) {
      expect(call.init).toEqual({
        method: "POST",
        headers: {authorization: "Bearer exact bearer secret"},
      });
      expect(call.init?.body).toBeUndefined();
    }
  });

  it("makes exactly three non-2xx attempts with 250ms and 1000ms delays", async () => {
    const calls: RecordedRequest[] = [];
    const delays: number[] = [];
    const worker = createAutomationWorker({
      fetch: createFetch(calls, (url) =>
        url.endsWith("/worker-alert")
          ? new Response(null, {status: 204})
          : guardedFailureResponse(),
      ),
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
      logger: {error: vi.fn()},
    });

    await runScheduled(worker, {
      cron: "0 2 * * *",
    });

    for (const job of [
      "journey-runner",
      "approvals-expirer",
      "renewal-runner",
    ]) {
      expect(
        calls.filter((call) => call.url.endsWith(`/${job}`)),
      ).toHaveLength(3);
    }
    expect(delays.sort((left, right) => left - right)).toEqual([
      250,
      250,
      250,
      1_000,
      1_000,
      1_000,
    ]);
  });

  it("counts fetch exceptions in the same three-attempt budget", async () => {
    const calls: RecordedRequest[] = [];
    const delays: number[] = [];
    const worker = createAutomationWorker({
      fetch: createFetch(calls, (url) => {
        if (url.endsWith("/worker-alert")) {
          return new Response(null, {status: 204});
        }
        throw new Error("network failure");
      }),
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
      logger: {error: vi.fn()},
    });

    await runScheduled(worker);

    expect(
      calls.filter((call) => call.url.endsWith("/journey-runner")),
    ).toHaveLength(3);
    expect(
      calls.filter((call) => call.url.endsWith("/approvals-expirer")),
    ).toHaveLength(3);
    expect(delays.sort((left, right) => left - right)).toEqual([
      250,
      250,
      1_000,
      1_000,
    ]);
  });

  it.each([200, 204, 299])(
    "does not retry a successful %s response",
    async (status) => {
      const calls: RecordedRequest[] = [];
      const sleep = vi.fn(async () => {});
      const worker = createAutomationWorker({
        fetch: createFetch(
          calls,
          () => new Response(null, {status}),
        ),
        sleep,
        logger: {error: vi.fn()},
      });

      await runScheduled(worker);

      expect(calls).toHaveLength(2);
      expect(sleep).not.toHaveBeenCalled();
    },
  );

  it("sends the exact strict alert payload with canonical UTC time after final HTTP failure", async () => {
    const calls: RecordedRequest[] = [];
    const worker = createAutomationWorker({
      fetch: createFetch(calls, (url) =>
        url.endsWith("/worker-alert")
          ? new Response(null, {status: 204})
          : new Response(null, {status: 429}),
      ),
      sleep: async () => {},
      logger: {error: vi.fn()},
    });

    await runScheduled(worker, {
      scheduledTime: Date.parse("2026-07-26T10:00:00+08:00"),
    });

    const alerts = calls.filter((call) =>
      call.url.endsWith("/worker-alert"),
    );
    expect(alerts).toHaveLength(2);
    for (const alert of alerts) {
      expect(alert.init?.method).toBe("POST");
      expect(alert.init?.headers).toEqual({
        authorization: "Bearer cron-test-secret",
        "content-type": "application/json",
      });
      const payload = JSON.parse(String(alert.init?.body)) as unknown;
      expect(payload).toEqual({
        job: expect.stringMatching(
          /^(journey-runner|approvals-expirer)$/,
        ),
        scheduledTime: "2026-07-26T02:00:00.000Z",
        attemptCount: 3,
        errorCode: "JOB_HTTP_ERROR",
      });
      expect(Object.keys(payload as object).sort()).toEqual([
        "attemptCount",
        "errorCode",
        "job",
        "scheduledTime",
      ]);
    }
  });

  it("distinguishes network and timeout failures using the Task 9 allowlist", async () => {
    const calls: RecordedRequest[] = [];
    let attempt = 0;
    const worker = createAutomationWorker({
      fetch: createFetch(calls, (url) => {
        if (url.endsWith("/worker-alert")) {
          return new Response(null, {status: 204});
        }
        attempt += 1;
        if (jobName(url) === "journey-runner") {
          throw new DOMException("request timed out", "TimeoutError");
        }
        throw new Error("network unavailable");
      }),
      sleep: async () => {},
      logger: {error: vi.fn()},
    });

    await runScheduled(worker);

    expect(attempt).toBe(6);
    const payloads = calls
      .filter((call) => call.url.endsWith("/worker-alert"))
      .map((call) => JSON.parse(String(call.init?.body)) as {
        job: string;
        errorCode: string;
      });
    expect(payloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          job: "journey-runner",
          errorCode: "JOB_TIMEOUT",
        }),
        expect.objectContaining({
          job: "approvals-expirer",
          errorCode: "JOB_NETWORK_ERROR",
        }),
      ]),
    );
  });

  it("logs one bounded sanitized record and never recursively alerts when the alert endpoint is unavailable", async () => {
    const calls: RecordedRequest[] = [];
    const logError = vi.fn();
    const worker = createAutomationWorker({
      fetch: createFetch(calls, (url) => {
        if (url.endsWith("/worker-alert")) {
          throw new Error(
            "network error exposed https://app.example.test cron-test-secret sensitive response body",
          );
        }
        if (url.endsWith("/journey-runner")) {
          return new Response("sensitive response body", {status: 503});
        }
        return new Response(null, {status: 204});
      }),
      sleep: async () => {},
      logger: {error: logError},
    });

    await runScheduled(worker);

    expect(
      calls.filter((call) => call.url.endsWith("/worker-alert")),
    ).toHaveLength(1);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith({
      job: "journey-runner",
      errorCode: "WORKER_ALERT_NETWORK_ERROR",
    });
    const serialized = JSON.stringify(logError.mock.calls);
    expect(serialized).not.toContain(DEFAULT_ENV.APP_URL);
    expect(serialized).not.toContain(DEFAULT_ENV.CRON_SECRET);
    expect(serialized).not.toContain("sensitive response body");
  });

  it.each([
    [
      {APP_URL: "http://app.example.test", CRON_SECRET: "secret"},
      "INVALID_APP_URL",
    ],
    [
      {
        APP_URL: "https://user:password@app.example.test",
        CRON_SECRET: "secret",
      },
      "INVALID_APP_URL",
    ],
    [
      {APP_URL: "javascript:alert(1)", CRON_SECRET: "secret"},
      "INVALID_APP_URL",
    ],
    [
      {APP_URL: "https://app.example.test", CRON_SECRET: "   "},
      "INVALID_CRON_SECRET",
    ],
  ] as const)(
    "does not issue requests for invalid Worker environment",
    async (env, errorCode) => {
      const calls: RecordedRequest[] = [];
      const logError = vi.fn();
      const worker = createAutomationWorker({
        fetch: createFetch(calls, () =>
          new Response(null, {status: 204}),
        ),
        sleep: async () => {},
        logger: {error: logError},
      });

      await runScheduled(worker, {env});

      expect(calls).toHaveLength(0);
      expect(logError).toHaveBeenCalledTimes(1);
      expect(logError).toHaveBeenCalledWith({errorCode});
      const serialized = JSON.stringify(logError.mock.calls);
      expect(serialized).not.toContain(env.APP_URL);
      expect(serialized).not.toContain(env.CRON_SECRET);
    },
  );

  it("permits HTTP only for local development URLs", async () => {
    const calls: RecordedRequest[] = [];
    const worker = createAutomationWorker({
      fetch: createFetch(calls, () => new Response(null, {status: 204})),
      sleep: async () => {},
      logger: {error: vi.fn()},
    });

    await runScheduled(worker, {
      env: {
        APP_URL: "http://localhost:3000/",
        CRON_SECRET: "local-secret",
      },
    });

    expect(calls.map((call) => call.url).sort()).toEqual([
      "http://localhost:3000/api/jobs/approvals-expirer",
      "http://localhost:3000/api/jobs/journey-runner",
    ]);
  });
});
