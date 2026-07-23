import {readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

const source = readFileSync(join(process.cwd(), "lib/db/repos/engagement.ts"), "utf8");

describe("at-risk repository boundary", () => {
  it("loads persisted login evidence and only prefilters eligible statuses", () => {
    expect(source).toContain('profiles.lastLoginAt} AS "lastLoginAt"');
    expect(source).toContain("memberships.status} IN ('active', 'past_due')");
    expect(source).not.toContain("engagementScores.score} < ${AT_RISK_SCORE_MAX}");
    expect(source).not.toContain("memberships.billingPeriodEnd} >= ${asOf}");
    expect(source).not.toContain("memberships.billingPeriodEnd} <= ${renewalBefore}");
  });
});