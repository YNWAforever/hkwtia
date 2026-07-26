import {readFileSync} from "node:fs";

import {describe, expect, it} from "vitest";

import {
  M3_AUTOMATION_JOB_KIND,
  M3_AUTOMATION_JOB_KINDS,
} from "@/lib/jobs/kinds";

const routes = [
  ["journey-runner", "JOURNEY", "app/api/jobs/journey-runner/route.ts"],
  ["renewal-runner", "RENEWAL", "app/api/jobs/renewal-runner/route.ts"],
  ["engagement-score", "ENGAGEMENT_SCORE", "app/api/jobs/engagement-score/route.ts"],
  ["approvals-expirer", "APPROVALS_EXPIRER", "app/api/jobs/approvals-expirer/route.ts"],
  ["worker-alert", "WORKER_ALERT", "app/api/jobs/worker-alert/route.ts"],
] as const;

describe("M3 persisted job kinds", () => {
  it("defines exactly the five automation kinds used by every job route", () => {
    expect(M3_AUTOMATION_JOB_KINDS).toEqual(routes.map(([kind]) => kind));
    expect(Object.values(M3_AUTOMATION_JOB_KIND)).toEqual(
      routes.map(([kind]) => kind),
    );

    for (const [, constant, path] of routes) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain(
        `kind: M3_AUTOMATION_JOB_KIND.${constant}`,
      );
      expect(source).toContain('from "@/lib/jobs/kinds"');
    }
  });
});
