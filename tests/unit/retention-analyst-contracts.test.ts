import {describe, expect, it} from "vitest";

import {
  RETENTION_ANALYST_AGENT_CONFIG,
  RETENTION_ANALYST_SYSTEM_PROMPT,
} from "@/config/agents/retention-analyst";
import {
  buildRetentionDraftPrompt,
  retentionDraftSchema,
  serializeRetentionFactPack,
} from "@/lib/ai/retention-analyst/contracts";
import type {RetentionCandidate} from "@/lib/ai/retention-analyst/candidates";

const candidate: RetentionCandidate = {
  profileId: "profile-private",
  membershipId: "11111111-1111-4111-8111-111111111111",
  locale: "zh-HK",
  planCode: "startup",
  renewalDate: "2027-05-01",
  score: 12,
  trend: "down",
  riskCodes: ["low_score_declining", "inactive_before_renewal"],
};

describe("retention analyst contracts", () => {
  it("accepts only strict bounded draft JSON", () => {
    expect(retentionDraftSchema.parse({
      subject: "會籍續期提示",
      body: "你好 {{first_name}}，你的會籍將於 {{renewal_date}} 續期。",
      reasonCodes: ["low_score_declining"],
    })).toEqual({
      subject: "會籍續期提示",
      body: "你好 {{first_name}}，你的會籍將於 {{renewal_date}} 續期。",
      reasonCodes: ["low_score_declining"],
    });

    expect(() => retentionDraftSchema.parse({
      subject: "Renewal",
      body: "Body",
      reasonCodes: ["low_score_declining"],
      recipient: "other@example.test",
    })).toThrow();
    expect(() => retentionDraftSchema.parse({
      subject: "",
      body: "Body",
      reasonCodes: [],
    })).toThrow();
  });

  it("serializes only approved fact-pack fields separately from the static system prompt", () => {
    const factPack = serializeRetentionFactPack(candidate);

    expect(JSON.parse(factPack)).toEqual({
      locale: "zh-HK",
      planCode: "startup",
      renewalDate: "2027-05-01",
      score: 12,
      trend: "down",
      riskCodes: ["low_score_declining", "inactive_before_renewal"],
    });
    expect(factPack).not.toContain(candidate.profileId);
    expect(factPack).not.toContain(candidate.membershipId);
    expect(buildRetentionDraftPrompt(candidate)).toContain(factPack);
    expect(RETENTION_ANALYST_SYSTEM_PROMPT).not.toContain(candidate.planCode);
  });

  it("preserves unavailable engagement facts without inference", () => {
    const unavailableCandidate: RetentionCandidate = {
      ...candidate,
      score: null,
      trend: null,
      riskCodes: ["inactive_before_renewal"],
    };
    const factPack = serializeRetentionFactPack(unavailableCandidate);
    const completePrompt =
      `${RETENTION_ANALYST_SYSTEM_PROMPT}\n${buildRetentionDraftPrompt(unavailableCandidate)}`;

    expect(JSON.parse(factPack)).toMatchObject({
      score: null,
      trend: null,
      riskCodes: ["inactive_before_renewal"],
    });
    expect(completePrompt).toMatch(
      /null means unavailable; do not infer or invent engagement values/i,
    );
  });

  it("constrains drafts to JSON-only localized safe content without side effects", () => {
    const completePrompt = `${RETENTION_ANALYST_SYSTEM_PROMPT}\n${buildRetentionDraftPrompt(candidate)}`;

    expect(completePrompt).toContain("JSON only");
    expect(completePrompt).toContain("zh-HK");
    expect(completePrompt).toContain("{{first_name}}");
    expect(completePrompt).toContain("{{renewal_date}}");
    expect(completePrompt).toContain("app-owned safe links");
    expect(completePrompt).toMatch(/do not invent discounts/i);
    expect(completePrompt).toMatch(/do not threaten/i);
    expect(completePrompt).toMatch(/do not include contact details/i);
    expect(completePrompt).toMatch(/do not send/i);
    expect(completePrompt).toMatch(/do not change the recipient/i);
    expect(completePrompt).not.toContain("{{email}}");
    expect(completePrompt).not.toContain("{{phone}}");
  });

  it("defines a distinct deterministic scheduled-agent configuration", () => {
    expect(RETENTION_ANALYST_AGENT_CONFIG).toMatchObject({
      name: "retention_analyst",
      version: "retention-analyst-v1",
      model: "openai:gpt-4.1-mini",
      tools: [],
    });
  });
});
