import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {describe, expect, it} from "vitest";

import {
  evaluateGoldenCases,
  executeOfflineCase,
  loadGoldenCases,
  type GoldenCase,
} from "../../evals/grader";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const corpusPath = resolve(root, "evals/concierge.golden.jsonl");

function replaceCase(
  cases: readonly GoldenCase[],
  id: string,
  transform: (testCase: GoldenCase) => GoldenCase,
): GoldenCase[] {
  return cases.map((testCase) =>
    testCase.id === id ? transform(testCase) : testCase
  );
}

describe("Concierge eval review regressions", () => {
  it("executes the shared Concierge service, runtime, and approved tool registry", async () => {
    const testCase = loadGoldenCases(corpusPath).find(
      ({id}) => id === "concierge-en-kb-grounding-01",
    )!;

    const actual = await executeOfflineCase(testCase);

    expect(actual.trace).toMatchObject({
      conciergeServiceInvoked: true,
      agentRuntimeInvoked: true,
      approvedToolRegistryInvoked: true,
    });
    expect(actual.toolCalls.map(({name}) => name)).toEqual(["kb_search"]);
    expect(actual.citations).toHaveLength(1);
  });

  it("fails the stable case when its request is changed to an unrelated prompt", async () => {
    const cases = loadGoldenCases(corpusPath);
    const targetId = "concierge-en-kb-grounding-01";
    const mutated = replaceCase(cases, targetId, (testCase) => ({
      ...testCase,
      request: {
        ...testCase.request,
        message: "What is the weather on Mars?",
      },
    }));

    const report = await evaluateGoldenCases(mutated);

    expect(report.failures).toEqual([
      {id: targetId, reason: "status mismatch"},
    ]);
  });

  it("fails safe when an approved repository result is changed to garbage", async () => {
    const cases = loadGoldenCases(corpusPath);
    const targetId = "concierge-en-kb-grounding-01";
    const mutated = replaceCase(cases, targetId, (testCase) => ({
      ...testCase,
      scenario: {
        ...testCase.scenario,
        repositories: {
          ...testCase.scenario.repositories,
          knowledge: [{unexpected: "garbage"}],
        },
      },
    }));

    const report = await evaluateGoldenCases(mutated);

    expect(report.failures[0]).toEqual({
      id: targetId,
      reason: "tool result rejected",
    });
  });

  it("fails PII refusal safety for actual or expected approval/task side effects", async () => {
    const cases = loadGoldenCases(corpusPath);
    const piiId = "concierge-en-pii-exfiltration-01";
    const expectedApproval = replaceCase(cases, piiId, (testCase) => ({
      ...testCase,
      expected: {
        ...testCase.expected,
        sideEffectsExact: {
          ...testCase.expected.sideEffectsExact,
          approvalStatus: "pending",
        },
      },
    }));
    const actualTask = replaceCase(cases, piiId, (testCase) => ({
      ...testCase,
      scenario: {
        ...testCase.scenario,
        forceStaffTaskAfterTurn: true,
      },
    }));

    const expectedReport = await evaluateGoldenCases(expectedApproval);
    const actualReport = await evaluateGoldenCases(actualTask);

    expect(expectedReport.piiRefusalsPassed).toBe(false);
    expect(actualReport.piiRefusalsPassed).toBe(false);
    expect(expectedReport.failures[0]?.id).toBe(piiId);
    expect(actualReport.failures[0]?.id).toBe(piiId);
  });

  it("enforces tier, pricing, complaint, and low-confidence coverage", () => {
    const cases = loadGoldenCases(corpusPath);
    const dimensions = new Set(cases.flatMap(({coverage}) => coverage));

    expect(dimensions).toEqual(expect.objectContaining(new Set([
      "membership_tier",
      "pricing",
      "complaint_escalation",
      "low_confidence_escalation",
    ])));
    for (const dimension of [
      "membership_tier",
      "pricing",
      "complaint_escalation",
      "low_confidence_escalation",
    ] as const) {
      expect(cases.some((item) =>
        item.coverage.includes(dimension)
        && item.request.message.trim().length > 0
      )).toBe(true);
    }
  });

  it("contains no final answer fixture readable by the deterministic provider", () => {
    const runtimeSource = readFileSync(
      resolve(root, "evals/runtime-harness.ts"),
      "utf8",
    );
    const corpus = readFileSync(corpusPath, "utf8");

    expect(runtimeSource).not.toContain("testCase.expected");
    expect(runtimeSource).not.toMatch(/\bexpected\s*:/);
    expect(corpus).not.toContain('"mock":{"toolCalls"');
    expect(corpus).not.toContain('"answer":');
  });
});
