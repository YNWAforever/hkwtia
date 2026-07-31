import {describe, expect, it} from "vitest";

import {redactAgentSummary} from "@/lib/ai/redaction";

describe("AI operational summary redaction", () => {
  it("removes contact details, member identifiers, and access tokens", () => {
    const redacted = redactAgentSummary(
      "Email alice@example.com, phone +852 9123 4567, member ID WTIA-2026-000123, "
      + "Authorization: Bearer sk-secret-access-token and access_token=oauth-secret-value.",
    );

    expect(redacted).toContain("[REDACTED_EMAIL]");
    expect(redacted).toContain("[REDACTED_PHONE]");
    expect(redacted).toContain("[REDACTED_MEMBER_ID]");
    expect(redacted).toContain("[REDACTED_TOKEN]");
    expect(redacted).not.toMatch(
      /alice@example|9123|WTIA-2026-000123|sk-secret|oauth-secret/i,
    );
  });

  it("bounds long user text without returning the discarded suffix", () => {
    const redacted = redactAgentSummary(`Question: ${"private phrase ".repeat(100)}`);

    expect(redacted.length).toBeLessThanOrEqual(240);
    expect(redacted.endsWith("[TRUNCATED]")).toBe(true);
  });
});
