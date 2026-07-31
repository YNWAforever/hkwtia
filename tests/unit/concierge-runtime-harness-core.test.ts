import {createHash} from "node:crypto";

import {describe, expect, it} from "vitest";

import {
  executeOfflineCase,
  type OfflineScenarioCase,
} from "../../evals/runtime-harness";

const emptyRepositories = {
  knowledge: [] as unknown[],
  events: [] as unknown[],
  memberContext: null,
};

function sourceId(prefix: "kb" | "funding", value: string): string {
  return `${prefix}:${
    createHash("sha256").update(value).digest("hex").slice(0, 24)
  }`;
}

function scenario(
  overrides: Partial<OfflineScenarioCase>,
): OfflineScenarioCase {
  return {
    id: "runtime-core",
    locale: "en",
    request: {
      message: "Tell me about WTIA membership",
      channel: "web",
      authenticatedProfileId: null,
      agentsEnabled: true,
      confirmedContactEmail: null,
      whatsapp: null,
    },
    scenario: {
      provider: {
        keywords: ["membership"],
        action: "kb_search",
        toolInput: {query: "WTIA membership", k: 3},
      },
      repositories: emptyRepositories,
    },
    ...overrides,
  };
}

describe("Concierge core runtime harness", () => {
  it("grounds a KB answer through the actual kb_search tool", async () => {
    const url = "https://www.hkwtia.org/en/membership";
    const actual = await executeOfflineCase(scenario({
      scenario: {
        provider: {
          keywords: ["membership"],
          action: "kb_search",
          toolInput: {query: "WTIA membership", k: 3},
        },
        repositories: {
          ...emptyRepositories,
          knowledge: [{
            title: "WTIA Membership",
            url,
            excerpt: "WTIA membership includes events and member programmes.",
            score: 0.94,
          }],
        },
      },
    }));

    expect(actual.trace).toMatchObject({
      conciergeServiceInvoked: true,
      agentRuntimeInvoked: true,
      approvedToolRegistryInvoked: true,
      toolResultRejected: false,
    });
    expect(actual.text).toBe(
      "WTIA membership includes events and member programmes.",
    );
    expect(actual.toolCalls).toEqual([{
      name: "kb_search",
      input: {query: "WTIA membership", k: 3},
    }]);
    expect(actual.citations).toEqual([{
      sourceId: sourceId("kb", url),
      title: "WTIA Membership",
      url,
    }]);
  });

  it("lists events through the actual list_events tool", async () => {
    const actual = await executeOfflineCase(scenario({
      id: "runtime-events",
      request: {
        message: "Which WTIA event is next month?",
        channel: "web",
        authenticatedProfileId: null,
        agentsEnabled: true,
        confirmedContactEmail: null,
        whatsapp: null,
      },
      scenario: {
        provider: {
          keywords: ["event"],
          action: "list_events",
          toolInput: {
            from: "2026-08-01T00:00:00+08:00",
            to: "2026-09-01T00:00:00+08:00",
            limit: 5,
          },
        },
        repositories: {
          ...emptyRepositories,
          events: [{
            slug: "ai-summit-2026",
            title: "WTIA AI Summit 2026",
            description: "Practical AI adoption.",
            startsAt: "2026-08-20T01:00:00.000Z",
            endsAt: "2026-08-20T09:00:00.000Z",
            venue: "Cyberport",
          }],
        },
      },
    }));

    expect(actual.toolCalls[0]?.name).toBe("list_events");
    expect(actual.text).toBe(
      "WTIA AI Summit 2026 — 2026-08-20T01:00:00.000Z — Cyberport",
    );
    expect(actual.citations[0]?.sourceId).toBe("event:ai-summit-2026");
  });

  it("screens funding through the actual immutable funding tool", async () => {
    const actual = await executeOfflineCase(scenario({
      id: "runtime-funding",
      request: {
        message: "Is advanced technology training funding available?",
        channel: "web",
        authenticatedProfileId: null,
        agentsEnabled: true,
        confirmedContactEmail: null,
        whatsapp: null,
      },
      scenario: {
        provider: {
          keywords: ["funding", "training"],
          action: "get_funding_schemes",
          toolInput: {
            hongKongIncorporated: true,
            hongKongBusinessRegistered: true,
            operatesInHongKong: true,
            nonSubvented: true,
            expansionProjectInCoveredEconomy: false,
            advancedTechnologyTraining: true,
            traineeHongKongPermanentResident: true,
            smartProductionLineInHongKong: false,
            targetSector: "ai-data-science",
            enterpriseInvestmentHkd: 250000,
            totalProjectCostHkd: 300000,
            eligibleAppliedRdOrPartnershipExpenditureHkd: 0,
          },
        },
        repositories: emptyRepositories,
      },
    }));

    expect(actual.toolCalls[0]?.name).toBe("get_funding_schemes");
    expect(actual.text).toContain(
      "New Industrialisation and Technology Training Programme",
    );
    expect(actual.citations).toContainEqual(expect.objectContaining({
      sourceId: sourceId("funding", "nittp"),
    }));
  });

  it("denies unauthenticated member context through the actual tool", async () => {
    const actual = await executeOfflineCase(scenario({
      id: "runtime-member-denial",
      request: {
        message: "When does my membership renew?",
        channel: "web",
        authenticatedProfileId: null,
        agentsEnabled: true,
        confirmedContactEmail: null,
        whatsapp: null,
      },
      scenario: {
        provider: {
          keywords: ["my membership"],
          action: "get_member_context",
          toolInput: {},
        },
        repositories: emptyRepositories,
      },
    }));

    expect(actual.toolCalls).toEqual([{
      name: "get_member_context",
      input: {},
    }]);
    expect(actual.status).toBe("refused");
    expect(actual.citations).toEqual([{
      sourceId: "policy:membership-access",
      title: "WTIA membership access policy",
      url: "https://www.hkwtia.org/en/membership",
    }]);
    expect(actual.sideEffects.staffTaskCreated).toBe(false);
  });

  it.each([
    ["payment", "I dispute this failed payment and want a refund."],
    ["complaint", "I want to make a formal complaint."],
  ])("escalates %s policy requests through the actual tool", async (_kind, message) => {
    const actual = await executeOfflineCase(scenario({
      id: `runtime-escalation-${_kind}`,
      request: {
        message,
        channel: "web",
        authenticatedProfileId: "profile-1",
        agentsEnabled: true,
        confirmedContactEmail: null,
        whatsapp: null,
      },
      scenario: {
        provider: {
          keywords: [_kind],
          action: "escalate",
          toolInput: {reason: "policy_boundary"},
        },
        repositories: emptyRepositories,
      },
    }));

    expect(actual.toolCalls[0]?.name).toBe("escalate");
    expect(actual.status).toBe("escalated");
    expect(actual.sideEffects.staffTaskCreated).toBe(true);
  });

  it("escalates low-confidence KB output through the actual service", async () => {
    const actual = await executeOfflineCase(scenario({
      id: "runtime-low-confidence",
      request: {
        message: "Tell me an uncertain WTIA policy fact.",
        channel: "web",
        authenticatedProfileId: null,
        agentsEnabled: true,
        confirmedContactEmail: null,
        whatsapp: null,
      },
      scenario: {
        provider: {
          keywords: ["uncertain", "policy"],
          action: "kb_search",
          toolInput: {query: "uncertain WTIA policy", k: 3},
        },
        repositories: {
          ...emptyRepositories,
          knowledge: [{
            title: "Weak source",
            url: "https://www.hkwtia.org/en/weak",
            excerpt: "An unsupported candidate answer.",
            score: 0.5,
          }],
        },
      },
    }));

    expect(actual.toolCalls[0]?.name).toBe("kb_search");
    expect(actual.status).toBe("escalated");
    expect(actual.text).toBe(
      "I’m not confident enough to answer from the available WTIA sources. I’ve asked our team to follow up.",
    );
    expect(actual.citations).toEqual([]);
    expect(actual.sideEffects.staffTaskCreated).toBe(true);
  });

  it("creates only a pending draft approval and never sends email", async () => {
    const actual = await executeOfflineCase(scenario({
      id: "runtime-draft",
      request: {
        message: "Draft an email about the Corporate plan.",
        channel: "web",
        authenticatedProfileId: "profile-1",
        agentsEnabled: true,
        confirmedContactEmail: "member@example.test",
        whatsapp: null,
      },
      scenario: {
        provider: {
          keywords: ["draft", "email"],
          action: "draft_email",
          toolInput: {
            recipient: "member@example.test",
            recipientConfirmed: true,
            subject: "WTIA Corporate plan",
            body: "Here is the requested Corporate plan information.",
          },
        },
        repositories: emptyRepositories,
      },
    }));

    expect(actual.toolCalls[0]?.name).toBe("draft_email");
    expect(actual.status).toBe("pending_approval");
    expect(actual.citations).toEqual([{
      sourceId: "approval:approval-1",
      title: "Pending WTIA email draft approval",
      url: "https://www.hkwtia.org/en/admin/approvals?approvalId=approval-1",
    }]);
    expect(actual.sideEffects).toEqual({
      approvalStatus: "pending",
      emailSent: false,
      staffTaskCreated: false,
      providerCalled: true,
    });
  });

  it("changes behavior when the actual request no longer matches intent", async () => {
    const base = scenario({
      scenario: {
        provider: {
          keywords: ["membership"],
          action: "kb_search",
          toolInput: {query: "WTIA membership", k: 3},
        },
        repositories: {
          ...emptyRepositories,
          knowledge: [{
            title: "WTIA Membership",
            url: "https://www.hkwtia.org/en/membership",
            excerpt: "Grounded membership answer.",
            score: 0.94,
          }],
        },
      },
    });

    const actual = await executeOfflineCase({
      ...base,
      request: {...base.request, message: "What is the weather on Mars?"},
    });

    expect(actual.toolCalls).toEqual([]);
    expect(actual.text).not.toBe("Grounded membership answer.");
  });

  it("fails safe when a repository returns garbage", async () => {
    const actual = await executeOfflineCase(scenario({
      scenario: {
        provider: {
          keywords: ["membership"],
          action: "kb_search",
          toolInput: {query: "WTIA membership", k: 3},
        },
        repositories: {
          ...emptyRepositories,
          knowledge: [{unexpected: "garbage"}],
        },
      },
    }));

    expect(actual.trace.toolResultRejected).toBe(true);
    expect(actual.citations).toEqual([]);
    expect(actual.status).toBe("escalated");
    expect(actual.sideEffects.staffTaskCreated).toBe(true);
  });
});
