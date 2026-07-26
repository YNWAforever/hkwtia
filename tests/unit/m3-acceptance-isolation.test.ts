import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it, vi} from "vitest";

import {
  createM3AcceptanceCaseLifecycle,
} from "@/tests/fixtures/m3-acceptance-safety";

const integrationSource = readFileSync(
  resolve(
    process.cwd(),
    "tests/integration/m3-acceptance.test.ts",
  ),
  "utf8",
);

describe("M3 database acceptance case lifecycle", () => {
  it("cleans before seeding every case and cleans again afterward", async () => {
    const calls: string[] = [];
    const clean = vi.fn(async () => {
      calls.push("clean");
    });
    const seed = vi.fn(async () => {
      calls.push("seed");
    });
    const lifecycle = createM3AcceptanceCaseLifecycle({
      clean,
      seed,
    });

    await lifecycle.prepare();
    expect(calls).toEqual(["clean", "seed"]);

    await lifecycle.cleanup();
    expect(calls).toEqual(["clean", "seed", "clean"]);
    expect(clean).toHaveBeenCalledTimes(2);
    expect(seed).toHaveBeenCalledOnce();
  });

  it("never seeds when the pre-case cleanup fails", async () => {
    const seed = vi.fn(async () => undefined);
    const lifecycle = createM3AcceptanceCaseLifecycle({
      async clean() {
        throw new Error("ISOLATION_CLEAN_FAILED");
      },
      seed,
    });

    await expect(lifecycle.prepare()).rejects.toThrow(
      "ISOLATION_CLEAN_FAILED",
    );
    expect(seed).not.toHaveBeenCalled();
  });

  it("uses per-case prepare and cleanup hooks instead of shared seed state", () => {
    expect(integrationSource).toContain(
      "beforeEach(async () => caseLifecycle.prepare()",
    );
    expect(integrationSource).toContain(
      "afterEach(async () => caseLifecycle.cleanup()",
    );

    const beforeAllStart = integrationSource.indexOf(
      "beforeAll(async () =>",
    );
    const beforeAllEnd = integrationSource.indexOf(
      "}, 120_000);",
      beforeAllStart,
    );
    const beforeAllBlock = integrationSource.slice(
      beforeAllStart,
      beforeAllEnd,
    );
    expect(beforeAllBlock).not.toContain("cleanM3Fixture");
    expect(beforeAllBlock).not.toContain("seedM3");
  });

  it("builds runner-created admin and Member 360 facts in that case", () => {
    const caseStart = integrationSource.indexOf(
      "shows seeded automation data through production admin",
    );
    const caseEnd = integrationSource.indexOf(
      "claims one newly due row once",
      caseStart,
    );
    const caseSource = integrationSource.slice(caseStart, caseEnd);
    const runnerSetup = caseSource.indexOf(
      "createHourlyAcceptancePost",
    );
    const runnerExecution = caseSource.indexOf("await post(");
    const dashboardRead = caseSource.indexOf(
      "getAutomationDashboard",
    );

    expect(runnerSetup).toBeGreaterThan(-1);
    expect(runnerExecution).toBeGreaterThan(runnerSetup);
    expect(dashboardRead).toBeGreaterThan(runnerExecution);
  });

  it("neutralizes seeded due rows and claims a unique earliest scoped row", () => {
    const caseStart = integrationSource.indexOf(
      "claims one newly due row once",
    );
    const caseSource = integrationSource.slice(caseStart);
    const neutralize = caseSource.indexOf(
      "UPDATE journey_state",
    );
    const uniqueEarliest = caseSource.indexOf(
      "uniqueEarliestScheduledAt",
    );
    const concurrentClaims = caseSource.indexOf(
      "Promise.all",
    );

    expect(neutralize).toBeGreaterThan(-1);
    expect(uniqueEarliest).toBeGreaterThan(neutralize);
    expect(concurrentClaims).toBeGreaterThan(uniqueEarliest);
  });
});
