import {describe, expect, it, vi} from "vitest";

import {createRetentionAnalystPost} from "@/app/api/jobs/retention-analyst/route";
import {automationCronActor} from "@/lib/auth/automation-actor";
import type {RetentionCandidate} from "@/lib/ai/retention-analyst/candidates";
import type {JobHandlerRepository} from "@/lib/jobs/handler";

const now = new Date("2027-03-31T16:30:00.000Z");
const secret = "cron-secret";
const candidate: RetentionCandidate = {
  profileId: "profile-a",
  membershipId: "22222222-2222-4222-8222-222222222222",
  locale: "en",
  planCode: "startup",
  renewalDate: "2027-04-20",
  score: 20,
  trend: "down",
  riskCodes: ["low_score_declining"],
};

function request(query = "", authorized = true): Request {
  return new Request(
    `http://localhost/api/jobs/retention-analyst${query}`,
    {
      method: "POST",
      headers: authorized ? {authorization: `Bearer ${secret}`} : {},
    },
  );
}

function harness() {
  const listCandidates = vi.fn(async () => [
    candidate,
    {...candidate, profileId: "profile-b"},
  ]);
  const runner = vi.fn(async () => ({
    considered: 2,
    drafted: 1,
    skippedPending: 0,
    deduplicated: 1,
    failed: 0,
  }));
  const jobs = {
    claim: vi.fn<JobHandlerRepository["claim"]>(
      async () => ({status: "claimed", attemptCount: 1}),
    ),
    complete: vi.fn(async () => true),
    fail: vi.fn(async () => true),
  };
  const post = createRetentionAnalystPost({
    candidates: {listCandidates},
    runner,
    jobs,
    now: () => now,
    secret: () => secret,
  });
  return {post, listCandidates, runner, jobs};
}

describe("Retention Analyst job route", () => {
  it("authenticates before exposing dry-run validation or work", async () => {
    const {post, listCandidates, runner, jobs} = harness();

    for (const query of ["", "?dryRun=1", "?dryRun=true"]) {
      const response = await post(request(query, false));
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({error: "UNAUTHORIZED"});
    }
    expect(listCandidates).not.toHaveBeenCalled();
    expect(runner).not.toHaveBeenCalled();
    expect(jobs.claim).not.toHaveBeenCalled();
  });

  it.each([
    "?dryRun=true",
    "?dryRun=0",
    "?dryRun=01",
    "?dryRun=1&dryRun=1",
    "?unknown=1",
  ])("rejects every query except absent dryRun or exact dryRun=1: %s", async (query) => {
    const {post, listCandidates, runner, jobs} = harness();

    const response = await post(request(query));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "INVALID_RETENTION_ANALYST_REQUEST",
    });
    expect(listCandidates).not.toHaveBeenCalled();
    expect(runner).not.toHaveBeenCalled();
    expect(jobs.claim).not.toHaveBeenCalled();
  });

  it("branches dry-run before claim, model execution, and writes", async () => {
    const {post, listCandidates, runner, jobs} = harness();

    const response = await post(request("?dryRun=1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      dryRun: true,
      summary: {
        considered: 2,
        drafted: 0,
        skippedPending: 0,
        deduplicated: 0,
        failed: 0,
      },
    });
    expect(listCandidates).toHaveBeenCalledWith(
      automationCronActor(),
      {asOf: now},
    );
    expect(runner).not.toHaveBeenCalled();
    expect(jobs.claim).not.toHaveBeenCalled();
    expect(jobs.complete).not.toHaveBeenCalled();
    expect(jobs.fail).not.toHaveBeenCalled();
  });

  it("claims and completes the stable Hong Kong daily run key", async () => {
    const {post, listCandidates, runner, jobs} = harness();

    const first = await post(request());
    jobs.claim.mockResolvedValueOnce({status: "duplicate"});
    const retry = await post(request());

    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toEqual({duplicate: true});
    expect(jobs.claim).toHaveBeenNthCalledWith(
      1,
      automationCronActor(),
      "retention-analyst:2027-04-01",
      "retention-analyst",
    );
    expect(jobs.claim).toHaveBeenNthCalledWith(
      2,
      automationCronActor(),
      "retention-analyst:2027-04-01",
      "retention-analyst",
    );
    expect(jobs.complete).toHaveBeenCalledWith(
      automationCronActor(),
      "retention-analyst:2027-04-01",
      1,
    );
    expect(runner).toHaveBeenCalledOnce();
    expect(runner).toHaveBeenCalledWith(now);
    expect(listCandidates).not.toHaveBeenCalled();
  });
});
