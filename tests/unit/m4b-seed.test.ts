import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

import {describe, expect, it} from "vitest";

import {
  M4B_ACCEPTANCE_OWNERSHIP_KEY,
} from "@/lib/acceptance/m4b-ownership";

const seedUrl = pathToFileURL(resolve("scripts/seed-m4b.ts"));
const seedExists = existsSync(seedUrl);

type SeedConnection = {
  query: (text: string, values?: readonly unknown[]) => Promise<unknown>;
  release: () => void;
};

type SeedModule = {
  buildM4BAcceptanceFixture: (asOf?: Date) => {
    asOf: Date;
    reportMonth: string;
    sourceLabel: string;
    retentionRequestKeys: readonly string[];
    boardSourceKey: string;
    agentRunOwnershipMarker: string;
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
  }, options?: {asOf?: Date}) => Promise<void>;
  runM4BSeed: (
    environment: Readonly<Record<string, string | undefined>>,
    createPool?: (databaseUrl: string) => {
      connect: () => Promise<SeedConnection>;
      end: () => Promise<void>;
    },
  ) => Promise<void>;
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
    it("derives seed ownership labels from the shared key", () => {
      const source = readFileSync(resolve("scripts/seed-m4b.ts"), "utf8");
      expect(source).toContain(
        "sourceLabel: M4B_ACCEPTANCE_OWNERSHIP_KEY",
      );
      expect(source).toContain(
        "`m4b-acceptance-owner:${M4B_ACCEPTANCE_OWNERSHIP_KEY}`",
      );
    });

    it("is stable with exactly three qualifying profiles and one nonqualifier", async () => {
      const {buildM4BAcceptanceFixture} = await loadSeed();
      const fixture = buildM4BAcceptanceFixture(
        new Date("2030-07-15T02:00:00.000Z"),
      );
      const qualifying = fixture.profiles
        .filter(({qualifiesForRetention}) => qualifiesForRetention)
        .map(({id}) => id)
        .sort();

      expect(fixture.asOf.toISOString()).toBe("2030-07-15T02:00:00.000Z");
      expect(fixture.reportMonth).toBe("2030-06");
      expect(fixture.sourceLabel).toBe(M4B_ACCEPTANCE_OWNERSHIP_KEY);
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
      expect(fixture.retentionRequestKeys).toEqual(
        fixture.expectedAtRiskProfileIds.map((profileId) =>
          `retention:2030-07-15:${profileId}:retention-analyst-v1`
        ),
      );
      expect(fixture.boardSourceKey).toBe(
        "board-report:2030-06:board-reporter-v1",
      );
      expect(fixture.agentRunOwnershipMarker).toBe(
        `m4b-acceptance-owner:${M4B_ACCEPTANCE_OWNERSHIP_KEY}`,
      );
    });

    it.each([
      ["2030-07-15T02:00:00.000Z", "2030-06", "2030-07-15"],
      ["2031-01-01T02:00:00.000Z", "2030-12", "2031-01-01"],
      ["2031-01-31T16:30:00.000Z", "2031-01", "2031-02-01"],
    ])(
      "aligns runtime keys and the previous complete Hong Kong month at %s",
      async (instant, reportMonth, hongKongDate) => {
        const {buildM4BAcceptanceFixture} = await loadSeed();
        const fixture = buildM4BAcceptanceFixture(new Date(instant));
        expect(fixture.reportMonth).toBe(reportMonth);
        expect(fixture.boardSourceKey).toBe(
          `board-report:${reportMonth}:board-reporter-v1`,
        );
        expect(fixture.retentionRequestKeys.every((key) =>
          key.startsWith(`retention:${hongKongDate}:`)
        )).toBe(true);
      },
    );

    it("rejects an invalid fixture clock", async () => {
      const {buildM4BAcceptanceFixture} = await loadSeed();
      expect(() => buildM4BAcceptanceFixture(new Date("invalid")))
        .toThrow("M4B_ACCEPTANCE_AS_OF_INVALID");
    });

    it("requires identical nonempty test and runtime DB URLs and refuses Production", async () => {
      const {assertM4BSeedEnvironment} = await loadSeed();
      const isolated = "postgres://test:test@localhost:5432/hkwtia_m4b_test";

      expect(() => assertM4BSeedEnvironment({
        DATABASE_URL: isolated,
        DATABASE_URL_TEST: isolated,
      }))
        .toThrow("M4B_ACCEPTANCE_SEED_NOT_AUTHORIZED");
      expect(() => assertM4BSeedEnvironment({
        DATABASE_URL: isolated,
        DATABASE_URL_TEST: isolated,
        M4B_ACCEPTANCE_SEED: "true",
        VERCEL_ENV: "production",
      })).toThrow("M4B_ACCEPTANCE_PRODUCTION_FORBIDDEN");
      expect(() => assertM4BSeedEnvironment({
        DATABASE_URL: isolated,
        DATABASE_URL_TEST: isolated,
        M4B_ACCEPTANCE_SEED: "true",
        NODE_ENV: "production",
      })).toThrow("M4B_ACCEPTANCE_PRODUCTION_FORBIDDEN");
      expect(() => assertM4BSeedEnvironment({
        DATABASE_URL: isolated,
        M4B_ACCEPTANCE_SEED: "true",
      })).toThrow("M4B_ACCEPTANCE_DATABASE_URL_TEST_REQUIRED");
      expect(() => assertM4BSeedEnvironment({
        DATABASE_URL: isolated,
        DATABASE_URL_TEST: `${isolated}_other`,
        M4B_ACCEPTANCE_SEED: "true",
      })).toThrow("M4B_ACCEPTANCE_DATABASE_URL_MISMATCH");
      expect(assertM4BSeedEnvironment({
        DATABASE_URL: ` ${isolated} `,
        DATABASE_URL_TEST: isolated,
        M4B_ACCEPTANCE_SEED: "true",
        NODE_ENV: "test",
      })).toBe(isolated);
    });

    it("rejects unsafe DB identities before creating a connection pool", async () => {
      const {runM4BSeed} = await loadSeed();
      let poolCreations = 0;
      const createPool = () => {
        poolCreations += 1;
        throw new Error("POOL_MUST_NOT_BE_CREATED");
      };
      await expect(runM4BSeed({
        M4B_ACCEPTANCE_SEED: "true",
        DATABASE_URL: "postgres://isolated",
      }, createPool)).rejects.toThrow("M4B_ACCEPTANCE_DATABASE_URL_TEST_REQUIRED");
      await expect(runM4BSeed({
        M4B_ACCEPTANCE_SEED: "true",
        DATABASE_URL: "postgres://isolated",
        DATABASE_URL_TEST: "postgres://different",
      }, createPool)).rejects.toThrow("M4B_ACCEPTANCE_DATABASE_URL_MISMATCH");
      await expect(runM4BSeed({
        M4B_ACCEPTANCE_SEED: "true",
        DATABASE_URL: "postgres://isolated",
        DATABASE_URL_TEST: "postgres://isolated",
        VERCEL_ENV: "production",
      }, createPool)).rejects.toThrow("M4B_ACCEPTANCE_PRODUCTION_FORBIDDEN");
      expect(poolCreations).toBe(0);
    });

    it("reconciles twice and targets every fixture-owned orphan run only", async () => {
      const {seedM4B} = await loadSeed();
      const statements: Array<{text: string; values?: readonly unknown[]}> = [];
      const connection: SeedConnection = {
        query: async (text, values) => {
          statements.push({text, values});
          return {rows: []};
        },
        release: () => undefined,
      };

      const options = {asOf: new Date("2030-07-15T02:00:00.000Z")};
      await seedM4B({connect: async () => connection}, options);
      await seedM4B({connect: async () => connection}, options);

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

      const firstCommit = normalized.indexOf("commit");
      const firstTransaction = normalized.slice(0, firstCommit);
      const linkedApprovalDelete = firstTransaction.findIndex((text) =>
        text.startsWith("delete from approvals as effects using agent_runs as owned")
      );
      const linkedPostDelete = firstTransaction.findIndex((text) =>
        text.startsWith("delete from posts as effects using agent_runs as owned")
      );
      const markedRunDelete = firstTransaction.findIndex((text) =>
        text.startsWith("delete from agent_runs")
      );
      const currentApprovalDelete = firstTransaction.findIndex((text) =>
        text === "delete from approvals where request_key = any($1::text[])"
      );
      const currentPostDelete = firstTransaction.findIndex((text) =>
        text === "delete from posts where source_key = $1"
      );
      expect([
        linkedApprovalDelete,
        linkedPostDelete,
        markedRunDelete,
        currentApprovalDelete,
        currentPostDelete,
      ]).toEqual([...[
        linkedApprovalDelete,
        linkedPostDelete,
        markedRunDelete,
        currentApprovalDelete,
        currentPostDelete,
      ]].sort((left, right) => left - right));
      expect(linkedApprovalDelete).toBeGreaterThan(0);
      const approvalDeleteSql = firstTransaction[linkedApprovalDelete] ?? "";
      const postDeleteSql = firstTransaction[linkedPostDelete] ?? "";
      expect(approvalDeleteSql).toContain(
        "effects.payload ->> 'agentrunid' = owned.id::text",
      );
      expect(approvalDeleteSql).toContain(
        "owned.agent = 'retention_analyst'",
      );
      expect(approvalDeleteSql).toContain(
        "owned.summary = $1 or owned.summary like $2",
      );
      expect(postDeleteSql).toContain(
        "effects.agent_run_id = owned.id",
      );
      expect(postDeleteSql).toContain("owned.agent = 'board_reporter'");
      expect(postDeleteSql).toContain(
        "owned.summary = $1 or owned.summary like $2",
      );
      for (const index of [linkedApprovalDelete, linkedPostDelete]) {
        expect(statements[index]?.values).toEqual([
          `m4b-acceptance-owner:${M4B_ACCEPTANCE_OWNERSHIP_KEY}`,
          `m4b-acceptance-owner:${M4B_ACCEPTANCE_OWNERSHIP_KEY}:%`,
        ]);
      }

      const runDeletes = statements.filter(({text}) =>
        /^\s*DELETE\s+FROM\s+agent_runs/i.test(text)
      );
      expect(runDeletes).toHaveLength(2);
      for (const statement of runDeletes) {
        const sql = statement.text.replace(/\s+/g, " ").toLowerCase();
        expect(sql).toContain(
          "agent in ('retention_analyst', 'board_reporter')",
        );
        expect(sql).toContain("summary = $1");
        expect(sql).toContain("summary like $2");
        expect(statement.values).toEqual([
          `m4b-acceptance-owner:${M4B_ACCEPTANCE_OWNERSHIP_KEY}`,
          `m4b-acceptance-owner:${M4B_ACCEPTANCE_OWNERSHIP_KEY}:%`,
        ]);
        expect(sql).not.toContain("select");
      }

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
