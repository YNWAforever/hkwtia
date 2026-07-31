import {describe, expect, it, vi} from "vitest";

import {createBoardReporterPost} from "@/app/api/jobs/board-reporter/route";
import type {BoardFactPack} from "@/lib/ai/board-reporter/contracts";
import type {JobHandlerRepository} from "@/lib/jobs/handler";
import {automationCronActor} from "@/lib/auth/automation-actor";

const now = new Date("2027-04-15T02:00:00.000Z");
const secret = "cron-secret";
const factPack: BoardFactPack = {
  reportMonth: "2027-03",
  window: {
    from: "2027-03-01",
    to: "2027-03-31",
    timezone: "Asia/Hong_Kong",
  },
  metrics: [
    {id: "arr_hkd", value: 3240, unit: "HKD"},
    {id: "mrr_hkd", value: 270, unit: "HKD"},
    {id: "renewal_rate", value: 66.7, unit: "percent", numerator: 2, denominator: 3},
    {id: "first_year_renewal_rate", value: 50, unit: "percent", numerator: 1, denominator: 2},
    {id: "funnel_started", value: 6, unit: "count"},
    {id: "funnel_profile_completed", value: 5, unit: "count"},
    {id: "funnel_checkout_or_review", value: 4, unit: "count"},
    {id: "funnel_activated", value: 3, unit: "count"},
    {id: "attendance_rate", value: 75, unit: "percent", numerator: 3, denominator: 4},
    {id: "at_risk_count", value: 2, unit: "count"},
  ],
};

function request(query = "", authorized = true): Request {
  return new Request(`http://localhost/api/jobs/board-reporter${query}`, {
    method: "POST",
    headers: authorized ? {authorization: `Bearer ${secret}`} : {},
  });
}

function harness() {
  const buildFactPack = vi.fn(async () => factPack);
  const runner = vi.fn(async () => ({
    reportMonth: "2027-03",
    postId: "11111111-1111-4111-8111-111111111111",
    created: true,
    metricCount: 10,
  }));
  const jobs = {
    claim: vi.fn<JobHandlerRepository["claim"]>(
      async () => ({status: "claimed", attemptCount: 1}),
    ),
    complete: vi.fn(async () => true),
    fail: vi.fn(async () => true),
  };
  const post = createBoardReporterPost({
    buildFactPack,
    runner,
    jobs,
    now: () => now,
    secret: () => secret,
  });
  return {post, buildFactPack, runner, jobs};
}

describe("Board Reporter job route", () => {
  it("authenticates before exposing request validation or doing work", async () => {
    const {post, buildFactPack, runner, jobs} = harness();

    for (const query of ["", "?dryRun=1", "?dryRun=true"]) {
      const response = await post(request(query, false));
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({error: "UNAUTHORIZED"});
    }
    expect(buildFactPack).not.toHaveBeenCalled();
    expect(runner).not.toHaveBeenCalled();
    expect(jobs.claim).not.toHaveBeenCalled();
  });

  it.each([
    "?dryRun=true",
    "?dryRun=0",
    "?dryRun=01",
    "?dryRun=1&dryRun=1",
    "?unknown=1",
  ])("accepts only absent dryRun or exact dryRun=1: %s", async (query) => {
    const {post, buildFactPack, runner, jobs} = harness();

    const response = await post(request(query));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "INVALID_BOARD_REPORTER_REQUEST",
    });
    expect(buildFactPack).not.toHaveBeenCalled();
    expect(runner).not.toHaveBeenCalled();
    expect(jobs.claim).not.toHaveBeenCalled();
  });

  it("returns authoritative facts before claim, model execution, run creation, or post writes", async () => {
    const {post, buildFactPack, runner, jobs} = harness();

    const response = await post(request("?dryRun=1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      dryRun: true,
      reportMonth: "2027-03",
      facts: factPack,
    });
    expect(buildFactPack).toHaveBeenCalledWith(now);
    expect(runner).not.toHaveBeenCalled();
    expect(jobs.claim).not.toHaveBeenCalled();
    expect(jobs.complete).not.toHaveBeenCalled();
    expect(jobs.fail).not.toHaveBeenCalled();
  });

  it("uses the stable Hong Kong monthly run key and retries cannot create a second post", async () => {
    const {post, buildFactPack, runner, jobs} = harness();

    const first = await post(request());
    jobs.claim.mockResolvedValueOnce({status: "duplicate"});
    const retry = await post(request());

    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toEqual({duplicate: true});
    expect(jobs.claim).toHaveBeenNthCalledWith(
      1,
      automationCronActor(),
      "board-reporter:2027-03",
      "board-reporter",
    );
    expect(jobs.claim).toHaveBeenNthCalledWith(
      2,
      automationCronActor(),
      "board-reporter:2027-03",
      "board-reporter",
    );
    expect(jobs.complete).toHaveBeenCalledWith(
      automationCronActor(),
      "board-reporter:2027-03",
      1,
    );
    expect(runner).toHaveBeenCalledOnce();
    expect(runner).toHaveBeenCalledWith(now);
    expect(buildFactPack).not.toHaveBeenCalled();
  });
});
