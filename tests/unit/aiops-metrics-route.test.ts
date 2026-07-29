import {describe, expect, it, vi} from "vitest";

import {automationCronActor} from "@/lib/auth/automation-actor";
import {
  createAiOpsMetricsPost,
} from "@/app/api/jobs/aiops-metrics/route";
import type {JobHandlerRepository} from "@/lib/jobs/handler";

const fixedNow = new Date("2026-07-30T03:45:00.000Z");

function request(options: {method?: string; authorization?: string} = {}) {
  return new Request("http://localhost/api/jobs/aiops-metrics", {
    method: options.method ?? "POST",
    headers: options.authorization === undefined
      ? undefined
      : {authorization: options.authorization},
  });
}

describe("AI-Ops metrics refresh route", () => {
  it("requires an authenticated POST before claiming an hourly refresh", async () => {
    const claim = vi.fn<JobHandlerRepository["claim"]>();
    const post = createAiOpsMetricsPost({
      jobs: {claim, complete: vi.fn(), fail: vi.fn()},
      now: () => fixedNow,
      secret: () => "cron-secret",
      runner: vi.fn(async () => ({refreshed: 1})),
    });

    const unauthorized = await post(request());
    const methodNotAllowed = await post(request({method: "GET"}));

    expect(unauthorized.status).toBe(401);
    expect(methodNotAllowed.status).toBe(405);
    expect(claim).not.toHaveBeenCalled();
  });

  it("claims one hourly run key and returns duplicate responses without rerunning", async () => {
    let claimed = false;
    const claim = vi.fn<JobHandlerRepository["claim"]>(async () => {
      if (claimed) return {status: "duplicate"};
      claimed = true;
      return {status: "claimed", attemptCount: 1};
    });
    const run = vi.fn(async () => ({refreshed: 1 as const}));
    const post = createAiOpsMetricsPost({
      jobs: {claim, complete: vi.fn(async () => true), fail: vi.fn()},
      now: () => fixedNow,
      secret: () => "cron-secret",
      runner: run,
    });

    const first = await post(request({authorization: "Bearer cron-secret"}));
    const second = await post(request({authorization: "Bearer cron-secret"}));
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(firstBody).toEqual({
      duplicate: false,
      summary: {refreshed: 1},
    });
    expect(secondBody).toEqual({duplicate: true});
    expect(run).toHaveBeenCalledOnce();
    expect(claim).toHaveBeenCalledWith(
      automationCronActor(),
      "aiops-metrics:2026-07-30T03",
      "aiops-metrics",
    );
  });

  it("fails a claimed refresh safely without exposing runner errors", async () => {
    const fail = vi.fn<JobHandlerRepository["fail"]>(async () => true);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const post = createAiOpsMetricsPost({
      jobs: {
        claim: async () => ({status: "claimed", attemptCount: 2}),
        complete: vi.fn(),
        fail,
      },
      now: () => fixedNow,
      secret: () => "cron-secret",
      runner: async () => {
        throw new Error("cron-secret private@example.test provider-private");
      },
    });

    const response = await post(request({authorization: "Bearer cron-secret"}));
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({error: "JOB_RUN_FAILED"});
    expect(fail).toHaveBeenCalledWith(
      automationCronActor(),
      "aiops-metrics:2026-07-30T03",
      2,
      "JOB_RUN_FAILED",
    );
    expect(text).not.toMatch(/cron-secret|private|provider/i);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
