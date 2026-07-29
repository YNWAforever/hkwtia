import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

import {describe, expect, it} from "vitest";

const seedUrl = pathToFileURL(resolve("scripts/seed-m4b.ts"));
const seedExists = existsSync(seedUrl);

type SeedConnection = {
  query: (text: string, values?: readonly unknown[]) => Promise<unknown>;
  release: () => void;
};

type SeedModule = {
  M4B_ACCEPTANCE_FIXTURE: {
    asOf: Date;
    reportMonth: string;
    sourceLabel: string;
    profiles: readonly {
      id: string;
      qualifiesForRetention: boolean;
    }[];
    expectedAtRiskProfileIds: readonly string[];
    expectedBoardMetrics: readonly {
      id: string;
      value: number;
    }[];
  };
  assertM4BSeedEnvironment: (
    environment: Readonly<Record<string, string | undefined>>,
  ) => string;
  seedM4B: (pool: {
    connect: () => Promise<SeedConnection>;
  }) => Promise<void>;
};

async function loadSeed(): Promise<SeedModule> {
  return await import(/* @vite-ignore */ seedUrl.href) as SeedModule;
}

describe("M4B acceptance seed", () => {
  it("adds explicit seed and focused e2e package scripts", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve("package.json"), "utf8"),
    ) as {scripts?: Record<string, string>};

    expect(packageJson.scripts?.["db:seed:m4b"]).toBe(
      "tsx scripts/seed-m4b.ts",
    );
    expect(packageJson.scripts?.e2e).toBe("playwright test");
  });

  it("provides the guarded M4B seed module", () => {
    expect(seedExists).toBe(true);
  });

  describe.runIf(seedExists)("fixture contract", () => {
    it("is stable with exactly three qualifying profiles and one nonqualifier", async () => {
      const {M4B_ACCEPTANCE_FIXTURE: fixture} = await loadSeed();
      const qualifying = fixture.profiles
        .filter(({qualifiesForRetention}) => qualifiesForRetention)
        .map(({id}) => id)
        .sort();

      expect(fixture.asOf.toISOString()).toBe("2030-07-15T02:00:00.000Z");
      expect(fixture.reportMonth).toBe("2030-06");
      expect(fixture.sourceLabel).toBe("m4b-acceptance-v1");
      expect(fixture.profiles).toHaveLength(4);
      expect(qualifying).toEqual(
        [...fixture.expectedAtRiskProfileIds].sort(),
      );
      expect(qualifying).toHaveLength(3);
      expect(
        fixture.profiles.filter(({qualifiesForRetention}) =>
          !qualifiesForRetention
        ),
      ).toHaveLength(1);
      expect(new Set(fixture.profiles.map(({id}) => id)).size).toBe(4);
      expect(fixture.expectedBoardMetrics).toHaveLength(10);
      expect(fixture.expectedBoardMetrics.at(-1)).toMatchObject({
        id: "at_risk_count",
        value: 3,
      });
    });

    it("requires explicit acceptance authorization and refuses Production", async () => {
      const {assertM4BSeedEnvironment} = await loadSeed();
      const isolated = "postgres://test:test@localhost:5432/hkwtia_m4b_test";

      expect(() => assertM4BSeedEnvironment({DATABASE_URL: isolated}))
        .toThrow("M4B_ACCEPTANCE_SEED_NOT_AUTHORIZED");
      expect(() => assertM4BSeedEnvironment({
        DATABASE_URL: isolated,
        M4B_ACCEPTANCE_SEED: "true",
        VERCEL_ENV: "production",
      })).toThrow("M4B_ACCEPTANCE_PRODUCTION_FORBIDDEN");
      expect(() => assertM4BSeedEnvironment({
        DATABASE_URL: isolated,
        M4B_ACCEPTANCE_SEED: "true",
        NODE_ENV: "production",
      })).toThrow("M4B_ACCEPTANCE_PRODUCTION_FORBIDDEN");
      expect(() => assertM4BSeedEnvironment({
        M4B_ACCEPTANCE_SEED: "true",
      })).toThrow("M4B_ACCEPTANCE_DATABASE_URL_REQUIRED");
      expect(assertM4BSeedEnvironment({
        DATABASE_URL: isolated,
        M4B_ACCEPTANCE_SEED: "true",
        NODE_ENV: "test",
      })).toBe(isolated);
    });

    it("reconciles twice transactionally without broad destructive SQL", async () => {
      const {seedM4B} = await loadSeed();
      const statements: Array<{text: string; values?: readonly unknown[]}> = [];
      const connection: SeedConnection = {
        query: async (text, values) => {
          statements.push({text, values});
          return {rows: []};
        },
        release: () => undefined,
      };

      await seedM4B({connect: async () => connection});
      await seedM4B({connect: async () => connection});

      const normalized = statements
        .map(({text}) => text.replace(/\s+/g, " ").trim().toLowerCase());
      expect(normalized.filter((text) => text === "begin")).toHaveLength(2);
      expect(normalized.filter((text) => text === "commit")).toHaveLength(2);
      expect(normalized.filter((text) =>
        text.includes("pg_advisory_xact_lock")
      )).toHaveLength(2);
      expect(normalized.some((text) =>
        text.includes("on conflict") && text.includes("profiles")
      )).toBe(true);
      expect(normalized.join("\n")).not.toMatch(/\btruncate\b|\bdrop table\b/);
      expect(normalized).not.toContain("delete from profiles");
      expect(normalized).not.toContain("delete from memberships");
      expect(normalized).not.toContain("delete from engagement_scores");

      const effectDeletes = statements.filter(({text}) =>
        /^\s*DELETE\s+FROM\s+(approvals|posts|agent_runs|email_log|whatsapp_log)/i
          .test(text)
      );
      expect(effectDeletes.length).toBeGreaterThan(0);
      for (const statement of effectDeletes) {
        expect(JSON.stringify(statement.values)).toMatch(
          /m4b|400000|2030-06|2030-07/,
        );
      }
    });
  });
});
