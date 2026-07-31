import {readFileSync} from "node:fs";

import {afterEach, describe, expect, it, vi} from "vitest";

import {
  AI_REQUEST_TIMEOUT_MS,
  createAutomationWorker,
  type WorkerEnv,
} from "../src/index";

const env: WorkerEnv = {
  APP_URL: "https://preview.example.test",
  CRON_SECRET: "cron-secret",
};

function scheduledEvent(): ScheduledController {
  return {
    cron: "15 18 * * *",
    scheduledTime: Date.parse("2027-04-01T18:15:00.000Z"),
    noRetry: vi.fn(),
  };
}

function dispatch(fetch: typeof globalThis.fetch): Promise<unknown> {
  let pending: Promise<unknown> | undefined;
  const worker = createAutomationWorker({
    fetch,
    sleep: (milliseconds) => new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    }),
    logger: {error: vi.fn()},
  });
  worker.scheduled(scheduledEvent(), env, {
    waitUntil(value) {
      pending = value;
    },
    passThroughOnException: vi.fn(),
    props: {},
  });
  if (!pending) throw new Error("WORKER_DID_NOT_REGISTER");
  return pending;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Retention Analyst Worker schedule", () => {
  it("dispatches the dedicated 18:15 UTC cron to only Retention Analyst", async () => {
    const fetch = vi.fn(async () => new Response(null, {status: 204}));

    await dispatch(fetch);

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0].toString()).toBe(
      "https://preview.example.test/api/jobs/retention-analyst",
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: {authorization: "Bearer cron-secret"},
      redirect: "manual",
    });
  });

  it("uses 240 seconds for every retry while reusing the same server-keyed endpoint", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2027-04-01T18:15:00.000Z");
    const urls: string[] = [];
    const abortDurations: number[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = input.toString();
      urls.push(url);
      if (url.endsWith("/worker-alert")) {
        return new Response(null, {status: 204});
      }
      const signal = init?.signal;
      if (!(signal instanceof AbortSignal)) {
        throw new Error("MISSING_ABORT_SIGNAL");
      }
      const startedAt = Date.now();
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          abortDurations.push(Date.now() - startedAt);
          reject(new DOMException("deadline", "AbortError"));
        }, {once: true});
      });
    });

    const completion = dispatch(fetch);
    await vi.runAllTimersAsync();
    await completion;

    expect(AI_REQUEST_TIMEOUT_MS).toBe(240_000);
    expect(abortDurations).toEqual([240_000, 240_000, 240_000]);
    expect(urls.filter((url) => url.endsWith("/retention-analyst"))).toEqual([
      "https://preview.example.test/api/jobs/retention-analyst",
      "https://preview.example.test/api/jobs/retention-analyst",
      "https://preview.example.test/api/jobs/retention-analyst",
    ]);
  });

  it("configures the production Worker cron without Board Reporter", () => {
    const wrangler = readFileSync("wrangler.toml", "utf8");
    expect(wrangler).toContain('"15 18 * * *"');
    expect(wrangler).not.toContain("board-reporter");
  });
});
