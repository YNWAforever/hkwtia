import {createHash} from "node:crypto";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {
  executeOfflineCase,
  loadGoldenCases,
} from "../../evals/grader";

describe("Concierge runtime evaluation harness", () => {
  it("executes the shared Concierge service, runtime, and approved tool registry", async () => {
    const testCase = loadGoldenCases(
      resolve(process.cwd(), "evals/concierge.golden.jsonl"),
    ).find(({id}) => id === "concierge-en-kb-grounding-01")!;
    const sourceUrl = "https://www.hkwtia.org/en/membership";
    const sourceId = `kb:${
      createHash("sha256").update(sourceUrl).digest("hex").slice(0, 24)
    }`;

    const actual = await executeOfflineCase(testCase);

    expect(actual.trace).toEqual({
      conciergeServiceInvoked: true,
      agentRuntimeInvoked: true,
      approvedToolRegistryInvoked: true,
      toolResultRejected: false,
    });
    expect(actual.toolCalls.map(({name}) => name)).toEqual(["kb_search"]);
    expect(actual.citations).toEqual([{
      sourceId,
      title: "WTIA Membership",
      url: sourceUrl,
    }]);
  });
});
