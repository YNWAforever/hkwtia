import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const seedPath = resolve("scripts/seed-m4c.ts");
const ownershipPath = resolve("lib/acceptance/m4c-ownership.ts");
const seedExists = existsSync(seedPath);
const ownershipExists = existsSync(ownershipPath);
const seedUrl = pathToFileURL(seedPath);

type SeedConnection = {
  query: (text: string, values?: readonly unknown[]) => Promise<unknown>;
  release: () => void;
};

type SeedModule = {
  buildM4CSeedFixture: (asOf: Date) => {
    conversations: readonly { id: string; createdAt: Date }[];
    messages: readonly { content: string; conversationId: string }[];
    agentRuns: readonly {
      agent: string;
      conversationId: string | null;
      costUsd: string;
    }[];
    latestOutcomes: readonly { status: string }[];
    renewalFacts: readonly { monthStart: string }[];
    expectedRenewalMetrics?: readonly {
      monthStart: string;
      renewalDueCount: number;
      renewalPaidCount: number;
      renewalRate: number;
      firstYearRenewalDueCount: number;
      firstYearRenewalPaidCount: number;
      firstYearRenewalRate: number;
    }[];
    buildLogs: readonly {
      slug: string;
      publishedAt: Date | null;
      bodyEn: string;
      bodyZhHk: string;
    }[];
    expectedCurrentMetrics: {
      conversationCount: number;
      terminalConversationCount: number;
      resolvedConversationCount: number;
      escalatedConversationCount: number;
      failedConversationCount: number;
      agentResolvedRate: number;
      escalationRate: number;
      failureRate: number;
      medianFirstResponseMs: number;
      firstResponseSampleCount: number;
      csatAverage: number;
      csatResponseCount: number;
      staffHoursSaved: number;
      llmCostUsd: number;
    };
  };
  assertM4CSeedEnvironment: (
    environment: Readonly<Record<string, string | undefined>>,
  ) => string;
  seedM4C: (
    pool: { connect: () => Promise<SeedConnection> },
    options: { asOf: Date },
  ) => Promise<void>;
  runM4CSeed: (
    environment: Readonly<Record<string, string | undefined>>,
    createPool?: (databaseUrl: string) => {
      connect: () => Promise<SeedConnection>;
      end: () => Promise<void>;
    },
  ) => Promise<void>;
};

async function loadSeed(): Promise<SeedModule> {
  return (await import(/* @vite-ignore */ seedUrl.href)) as SeedModule;
}

describe("M4C acceptance seed", () => {
  it("provides the shared ownership key, seed module, and package command", () => {
    expect(ownershipExists).toBe(true);
    expect(seedExists).toBe(true);
    const packageJson = JSON.parse(
      readFileSync(resolve("package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    expect(packageJson.scripts?.["db:seed:m4c"]).toBe(
      "tsx scripts/seed-m4c.ts",
    );
    if (ownershipExists) {
      expect(readFileSync(ownershipPath, "utf8")).toContain(
        'M4C_ACCEPTANCE_OWNERSHIP_KEY = "m4c-acceptance-v1"',
      );
    }
  });

  describe.runIf(seedExists)("fixture contract", () => {
    it("builds the exact deterministic public metrics fixture", async () => {
      const { buildM4CSeedFixture } = await loadSeed();
      const fixture = buildM4CSeedFixture(new Date("2030-07-15T02:00:00.000Z"));

      expect(fixture.conversations).toHaveLength(15);
      expect(fixture.agentRuns).toHaveLength(40);
      expect(
        fixture.agentRuns.filter(({ agent }) => agent === "concierge"),
      ).toHaveLength(38);
      expect(
        fixture.agentRuns
          .filter(({ conversationId }) => conversationId === null)
          .map(({ agent }) => agent)
          .sort(),
      ).toEqual(["board_reporter", "retention_analyst"]);
      expect(
        fixture.latestOutcomes.filter(({ status }) => status === "completed"),
      ).toHaveLength(12);
      expect(
        fixture.latestOutcomes.filter(({ status }) => status === "escalated"),
      ).toHaveLength(3);
      expect(
        fixture.latestOutcomes.filter(({ status }) => status === "failed"),
      ).toHaveLength(0);
      expect(fixture.renewalFacts).toHaveLength(12);
      expect(fixture.expectedRenewalMetrics).toEqual(
        fixture.renewalFacts.map(({ monthStart }) => ({
          monthStart,
          renewalDueCount: 2,
          renewalPaidCount: 1,
          renewalRate: 0.5,
          firstYearRenewalDueCount: 1,
          firstYearRenewalPaidCount: 1,
          firstYearRenewalRate: 1,
        })),
      );
      expect(fixture.buildLogs.map(({ slug }) => slug).sort()).toEqual([
        "m4-public-ai-ops",
        "m4-runtime-and-concierge",
      ]);
      expect(
        fixture.buildLogs.every(({ publishedAt }) => publishedAt !== null),
      ).toBe(true);
      expect(fixture.expectedCurrentMetrics).toEqual({
        conversationCount: 15,
        terminalConversationCount: 15,
        resolvedConversationCount: 12,
        escalatedConversationCount: 3,
        failedConversationCount: 0,
        agentResolvedRate: 0.8,
        escalationRate: 0.2,
        failureRate: 0,
        medianFirstResponseMs: 800,
        firstResponseSampleCount: 15,
        csatAverage: 4.5,
        csatResponseCount: 10,
        staffHoursSaved: 1.2,
        llmCostUsd: 0.068,
      });
      expect(
        fixture.agentRuns.reduce(
          (total, { costUsd }) => total + Number(costUsd),
          0,
        ),
      ).toBeCloseTo(0.068, 8);
      expect(
        fixture.messages.filter(({ content }) =>
          content.includes("M4C_PRIVATE_CANARY_private@example.test"),
        ),
      ).toHaveLength(1);
      expect(JSON.stringify(fixture.buildLogs)).not.toContain(
        "M4C_PRIVATE_CANARY",
      );
    });

    it("requires authorization, identical isolated URLs, and non-production before pool creation", async () => {
      const { assertM4CSeedEnvironment, runM4CSeed } = await loadSeed();
      const isolated = "postgres://isolated";
      expect(() =>
        assertM4CSeedEnvironment({
          DATABASE_URL: isolated,
          DATABASE_URL_TEST: isolated,
        }),
      ).toThrow("M4C_ACCEPTANCE_SEED_NOT_AUTHORIZED");
      expect(() =>
        assertM4CSeedEnvironment({
          M4C_ACCEPTANCE_SEED: "true",
          DATABASE_URL: isolated,
        }),
      ).toThrow("M4C_ACCEPTANCE_DATABASE_URL_TEST_REQUIRED");
      expect(() =>
        assertM4CSeedEnvironment({
          M4C_ACCEPTANCE_SEED: "true",
          DATABASE_URL: isolated,
          DATABASE_URL_TEST: `${isolated}-other`,
        }),
      ).toThrow("M4C_ACCEPTANCE_DATABASE_URL_MISMATCH");
      expect(() =>
        assertM4CSeedEnvironment({
          M4C_ACCEPTANCE_SEED: "true",
          DATABASE_URL: isolated,
          DATABASE_URL_TEST: isolated,
          NODE_ENV: "production",
        }),
      ).toThrow("M4C_ACCEPTANCE_PRODUCTION_FORBIDDEN");

      let poolCreations = 0;
      const createPool = () => {
        poolCreations += 1;
        throw new Error("POOL_MUST_NOT_BE_CREATED");
      };
      await expect(
        runM4CSeed(
          {
            M4C_ACCEPTANCE_SEED: "true",
            DATABASE_URL: isolated,
          },
          createPool,
        ),
      ).rejects.toThrow("M4C_ACCEPTANCE_DATABASE_URL_TEST_REQUIRED");
      expect(poolCreations).toBe(0);
    });

    it("uses one narrow transaction, verifies counts, and refreshes only after commit", async () => {
      const { seedM4C } = await loadSeed();
      const statements: Array<{ text: string; values?: readonly unknown[] }> =
        [];
      const connection: SeedConnection = {
        query: async (text, values) => {
          statements.push({ text, values });
          if (/select\s+count/i.test(text)) {
            return {
              rows: [{ conversation_count: 15, run_count: 40, post_count: 2 }],
            };
          }
          return { rows: [] };
        },
        release: () => undefined,
      };

      await seedM4C(
        { connect: async () => connection },
        { asOf: new Date("2030-07-15T02:00:00.000Z") },
      );
      const sql = statements.map(({ text }) =>
        text.replace(/\s+/g, " ").trim().toLowerCase(),
      );
      expect(sql.filter((text) => text === "begin")).toHaveLength(1);
      expect(sql.filter((text) => text === "commit")).toHaveLength(1);
      expect(sql.some((text) => text.includes("pg_advisory_xact_lock"))).toBe(
        true,
      );
      const startupPlanIndex = sql.findIndex((text) =>
        text.includes("insert into membership_plans"),
      );
      const membershipIndex = sql.findIndex((text) =>
        text.includes("insert into memberships"),
      );
      expect(startupPlanIndex).toBeGreaterThan(0);
      expect(membershipIndex).toBeGreaterThan(startupPlanIndex);
      expect(sql[startupPlanIndex]).toContain("on conflict (code) do nothing");
      const ownedRunDelete = statements.find(({ text }) =>
        /delete\s+from\s+agent_runs/i.test(text),
      );
      expect(ownedRunDelete?.values?.[0]).toHaveLength(40);
      expect(sql.join("\n")).not.toMatch(/\btruncate\b|\bdrop table\b/);
      expect(sql.join("\n")).not.toContain("m4a-acceptance");
      expect(sql.join("\n")).not.toContain("m4b-acceptance");
      for (const statement of statements.filter(({ text }) =>
        /^\s*delete\s+/i.test(text),
      )) {
        expect(JSON.stringify(statement.values)).toMatch(/m4c|500000/);
      }
      const commitIndex = sql.indexOf("commit");
      const refreshIndex = sql.findIndex(
        (text) =>
          text ===
          "refresh materialized view concurrently aiops_monthly_metrics",
      );
      expect(commitIndex).toBeGreaterThan(0);
      expect(refreshIndex).toBeGreaterThan(commitIndex);
    });

    it("types reused nullable agent-run timestamps explicitly", async () => {
      const { seedM4C } = await loadSeed();
      const statements: Array<{ text: string }> = [];
      const connection: SeedConnection = {
        query: async (text) => {
          statements.push({ text });
          if (/select\s+count/i.test(text)) {
            return {
              rows: [{ conversation_count: 15, run_count: 40, post_count: 2 }],
            };
          }
          return { rows: [] };
        },
        release: () => undefined,
      };

      await seedM4C(
        { connect: async () => connection },
        { asOf: new Date("2030-07-15T02:00:00.000Z") },
      );

      const agentRunsInsert = statements
        .find(({ text }) => /insert\s+into\s+agent_runs/i.test(text))
        ?.text.replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      expect(agentRunsInsert).toContain("$8::timestamptz");
      expect(agentRunsInsert).toContain("$9::timestamptz");
      expect(agentRunsInsert).toContain(
        "coalesce($9::timestamptz, $8::timestamptz)",
      );
    });
  });
});
