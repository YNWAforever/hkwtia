import {describe, expect, it, vi} from "vitest";

import {automationCronActor} from "@/lib/auth/automation-actor";
import type {AgentConfig} from "@/lib/ai/scheduled-runtime";
import type {RetentionCandidate} from "@/lib/ai/retention-analyst/candidates";
import {runRetentionAnalyst} from "@/lib/ai/retention-analyst/service";

const candidate: RetentionCandidate = {
  profileId: "profile-a",
  membershipId: "22222222-2222-4222-8222-222222222222",
  locale: "en",
  planCode: "startup",
  renewalDate: "2027-04-20",
  score: null,
  trend: null,
  riskCodes: ["inactive_before_renewal"],
};
const agentConfig = {
  enabled: true,
  model: "openai:gpt-4.1-mini",
  credentials: {},
  system: "retention system",
  runtime: {},
} as AgentConfig;

function candidateFor(
  profileId: string,
  membershipId: string,
): RetentionCandidate {
  return {
    ...candidate,
    profileId,
    membershipId,
  };
}

describe("retention analyst service", () => {
  it("creates one scheduled run and one pending idempotent draft", async () => {
    const listCandidates = vi.fn(async () => [candidate]);
    const hasPendingRetentionOutreach = vi.fn(async () => false);
    const start = vi.fn(async () => ({}));
    const runJson = vi.fn(async () => ({
      subject: "Membership renewal",
      body: "Hello {{first_name}}, renewal is {{renewal_date}}.",
      reasonCodes: ["inactive_before_renewal"] as ("inactive_before_renewal")[],
    }));
    const createRetentionOutreachOnce = vi.fn(async () => ({
      approvalId: "33333333-3333-4333-8333-333333333333",
      created: true,
    }));

    await expect(runRetentionAnalyst(
      automationCronActor(),
      {
        asOf: new Date("2027-03-31T16:30:00.000Z"),
        agentConfig,
      },
      {
        candidates: {listCandidates},
        approvals: {
          hasPendingRetentionOutreach,
          createRetentionOutreachOnce,
        },
        agentRuns: {start},
        runJson,
        createRunId: () => "11111111-1111-4111-8111-111111111111",
      },
    )).resolves.toEqual({
      considered: 1,
      drafted: 1,
      skippedPending: 0,
      deduplicated: 0,
      failed: 0,
    });

    const scheduledActor = {
      kind: "agent",
      agent: "retention_analyst",
      runId: "11111111-1111-4111-8111-111111111111",
      conversationId: null,
      profileId: null,
      trigger: "scheduled",
    };
    expect(start).toHaveBeenCalledWith(scheduledActor, {
      provider: null,
      model: null,
      startedAt: new Date("2027-03-31T16:30:00.000Z"),
    });
    expect(runJson).toHaveBeenCalledWith(expect.objectContaining({
      actor: scheduledActor,
      agentConfig,
    }));
    expect(createRetentionOutreachOnce).toHaveBeenCalledWith(
      scheduledActor,
      {
        requestKey: "retention:2027-04-01:profile-a:retention-analyst-v1",
        profileId: candidate.profileId,
        membershipId: candidate.membershipId,
        locale: candidate.locale,
        reasonCodes: candidate.riskCodes,
        subject: "Membership renewal",
        body: "Hello {{first_name}}, renewal is {{renewal_date}}.",
      },
    );
    expect(JSON.stringify(createRetentionOutreachOnce.mock.calls)).not.toMatch(
      /email|phone/i,
    );
  });

  it("does no work when the agent kill switch is disabled", async () => {
    const listCandidates = vi.fn(async () => [candidate]);
    const hasPendingRetentionOutreach = vi.fn(async () => false);
    const start = vi.fn(async () => ({}));
    const runJson = vi.fn();
    const createRetentionOutreachOnce = vi.fn();

    await expect(runRetentionAnalyst(
      automationCronActor(),
      {
        asOf: new Date("2027-04-01T00:00:00.000Z"),
        agentConfig: {...agentConfig, enabled: false},
      },
      {
        candidates: {listCandidates},
        approvals: {
          hasPendingRetentionOutreach,
          createRetentionOutreachOnce,
        },
        agentRuns: {start},
        runJson,
        createRunId: vi.fn(),
      },
    )).resolves.toEqual({
      considered: 0,
      drafted: 0,
      skippedPending: 0,
      deduplicated: 0,
      failed: 0,
    });

    expect(listCandidates).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(runJson).not.toHaveBeenCalled();
    expect(createRetentionOutreachOnce).not.toHaveBeenCalled();
  });

  it("skips pending profiles and isolates schema/model and deduplication outcomes", async () => {
    const candidates = [
      candidateFor("profile-d", "22222222-2222-4222-8222-222222222225"),
      candidateFor("profile-c", "22222222-2222-4222-8222-222222222224"),
      candidateFor("profile-b", "22222222-2222-4222-8222-222222222223"),
      candidateFor("profile-a", "22222222-2222-4222-8222-222222222222"),
    ];
    const listCandidates = vi.fn(async () => candidates);
    const hasPendingRetentionOutreach = vi.fn(
      async (_actor, profileId: string) => profileId === "profile-b",
    );
    const start = vi.fn(async (actor: {runId: string}) => {
      void actor;
      return {};
    });
    const runJson = vi.fn(async ({actor}) => {
      if (actor.runId === "11111111-1111-4111-8111-111111111102") {
        throw new Error("invalid_provider_response");
      }
      return {
        subject: "Membership renewal",
        body: "Draft body",
        reasonCodes: ["inactive_before_renewal"] as ("inactive_before_renewal")[],
      };
    });
    const createRetentionOutreachOnce = vi.fn(async (_actor, approvalInput) => ({
      approvalId: "33333333-3333-4333-8333-333333333333",
      created: approvalInput.profileId !== "profile-d",
    }));
    const createRunId = vi.fn()
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111101")
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111102")
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111103");

    await expect(runRetentionAnalyst(
      automationCronActor(),
      {asOf: new Date("2027-04-01T00:00:00.000Z"), agentConfig},
      {
        candidates: {listCandidates},
        approvals: {
          hasPendingRetentionOutreach,
          createRetentionOutreachOnce,
        },
        agentRuns: {start},
        runJson,
        createRunId,
      },
    )).resolves.toEqual({
      considered: 4,
      drafted: 1,
      skippedPending: 1,
      deduplicated: 1,
      failed: 1,
    });

    expect(hasPendingRetentionOutreach.mock.calls.map((call) => call[1])).toEqual([
      "profile-a",
      "profile-b",
      "profile-c",
      "profile-d",
    ]);
    expect(start.mock.calls.map((call) => call[0].runId)).toEqual([
      "11111111-1111-4111-8111-111111111101",
      "11111111-1111-4111-8111-111111111102",
      "11111111-1111-4111-8111-111111111103",
    ]);
    expect(runJson).toHaveBeenCalledTimes(3);
    expect(createRetentionOutreachOnce.mock.calls.map(
      (call) => call[1].profileId,
    )).toEqual(["profile-a", "profile-d"]);
  });

  it("runs at most three independent candidates concurrently", async () => {
    const candidates = Array.from({length: 6}, (_, index) => candidateFor(
      `profile-${index + 1}`,
      `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    ));
    let active = 0;
    let maximumActive = 0;
    const runJson = vi.fn(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return {
        subject: "Membership renewal",
        body: "Draft body",
        reasonCodes: ["inactive_before_renewal"] as ("inactive_before_renewal")[],
      };
    });
    let runIndex = 0;

    await expect(runRetentionAnalyst(
      automationCronActor(),
      {asOf: new Date("2027-04-01T00:00:00.000Z"), agentConfig},
      {
        candidates: {listCandidates: vi.fn(async () => candidates)},
        approvals: {
          hasPendingRetentionOutreach: vi.fn(async () => false),
          createRetentionOutreachOnce: vi.fn(async () => ({
            approvalId: "33333333-3333-4333-8333-333333333333",
            created: true,
          })),
        },
        agentRuns: {start: vi.fn(async () => ({}))},
        runJson,
        createRunId: () => {
          runIndex += 1;
          return `10000000-0000-4000-8000-${String(runIndex).padStart(12, "0")}`;
        },
      },
    )).resolves.toMatchObject({
      considered: 6,
      drafted: 6,
      failed: 0,
    });

    expect(runJson).toHaveBeenCalledTimes(6);
    expect(maximumActive).toBe(3);
  });
});
