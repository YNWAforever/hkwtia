import {readFileSync} from "node:fs";

import {describe, expect, it, vi} from "vitest";

import {createAutomationWorker} from "../src/index";

const env = {
  APP_URL: "https://preview.example.test",
  CRON_SECRET: "cron-secret",
};

function scheduledEvent(cron: string): ScheduledController {
  return {
    cron,
    scheduledTime: Date.parse("2026-07-28T03:00:00.000Z"),
    noRetry: vi.fn(),
  };
}

async function invoke(cron: string, fetch: typeof globalThis.fetch) {
  let pending: Promise<unknown> | undefined;
  const worker = createAutomationWorker({
    fetch,
    sleep: vi.fn(async () => undefined),
  });
  worker.scheduled(
    scheduledEvent(cron),
    env,
    {
      waitUntil(value) {
        pending = value;
      },
      passThroughOnException: vi.fn(),
      props: {},
    },
  );
  await pending;
}

describe("chat retention Worker schedule", () => {
  it("dispatches chat retention only for the dedicated 03:00 UTC cron", async () => {
    const fetch = vi.fn(async () => new Response(null, {status: 204}));

    await invoke("0 3 * * *", fetch);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0].toString()).toBe(
      "https://preview.example.test/api/jobs/chat-retention",
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: {authorization: "Bearer cron-secret"},
    });
  });

  it.each([
    ["0 * * * *", ["journey-runner", "approvals-expirer"]],
    ["0 2 * * *", ["renewal-runner"]],
    ["0 18 * * *", ["engagement-score"]],
  ])("preserves the existing M3 dispatch for %s", async (cron, expected) => {
    const fetch = vi.fn(async () => new Response(null, {status: 204}));

    await invoke(cron, fetch);

    expect(fetch.mock.calls.map(([url]) => url.toString()).sort()).toEqual(
      expected.map(
        (job) => `https://preview.example.test/api/jobs/${job}`,
      ).sort(),
    );
    expect(
      fetch.mock.calls.some(([url]) =>
        url.toString().endsWith("/chat-retention"),
      ),
    ).toBe(false);
  });

  it("configures all three M3 schedules plus the M4 retention schedule", () => {
    const wrangler = readFileSync("wrangler.toml", "utf8");
    expect(wrangler).toContain(
      'crons = ["0 * * * *", "0 2 * * *", "0 18 * * *", "0 3 * * *"]',
    );
  });
});
