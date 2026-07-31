import {existsSync, readFileSync} from "node:fs";
import {join} from "node:path";

import {getTableConfig} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import * as serverSchema from "@/lib/db/server-schema";

const schemaExports = serverSchema as unknown as Record<string, unknown>;

function enumValues(name: string): readonly string[] | undefined {
  const value = schemaExports[name] as
    | Readonly<{enumValues?: readonly string[]}>
    | undefined;
  return value?.enumValues;
}

function tableConfig(name: string) {
  const table = schemaExports[name];
  expect(table, `${name} must be exported by the server schema`).toBeDefined();
  if (!table) return null;
  return getTableConfig(
    table as Parameters<typeof getTableConfig>[0],
  );
}

function column(config: NonNullable<ReturnType<typeof tableConfig>>, name: string) {
  return config.columns.find((candidate) => candidate.name === name);
}

describe("M4B scheduled-agent schema contract", () => {
  it("defines the exact durable agent identities and scheduled trigger", () => {
    expect(enumValues("agentNameEnum")).toEqual([
      "concierge",
      "retention_analyst",
      "board_reporter",
    ]);
    expect(enumValues("agentTriggerEnum")).toEqual([
      "web",
      "whatsapp",
      "scheduled",
    ]);

    const config = tableConfig("agentRuns");
    if (!config) return;
    const agent = column(config, "agent");
    expect(agent).toBeDefined();
    expect(agent?.notNull).toBe(true);
    expect(agent?.default).toBe("concierge");
  });

  it("adds nullable approval request keys with partial uniqueness", () => {
    const config = tableConfig("approvals");
    if (!config) return;
    const requestKey = column(config, "request_key");
    expect(requestKey).toBeDefined();
    expect(requestKey?.notNull).toBe(false);

    const index = config.indexes.find(
      (candidate) => candidate.config.name === "approvals_request_key_unique",
    );
    expect(index?.config.unique).toBe(true);
    expect(index?.config.where).toBeDefined();
  });

  it("defines the build-spec posts table with provenance and unique identities", () => {
    expect(enumValues("postKindEnum")).toEqual(["news", "buildlog", "page"]);

    const config = tableConfig("posts");
    if (!config) return;
    const columns = new Map(
      config.columns.map((candidate) => [candidate.name, candidate]),
    );
    expect([...columns.keys()].sort()).toEqual([
      "agent_run_id",
      "author",
      "body_mdx",
      "created_at",
      "id",
      "kind",
      "published_at",
      "slug",
      "source_key",
      "title_en",
      "title_zh",
      "updated_at",
    ]);
    for (const required of [
      "id",
      "slug",
      "kind",
      "title_en",
      "title_zh",
      "body_mdx",
      "author",
      "created_at",
      "updated_at",
    ]) {
      expect(columns.get(required)?.notNull, `${required} must be non-null`)
        .toBe(true);
    }
    expect(columns.get("published_at")?.notNull).toBe(false);
    expect(columns.get("source_key")?.notNull).toBe(false);
    expect(columns.get("agent_run_id")?.notNull).toBe(false);

    const indexes = new Map(
      config.indexes.map((candidate) => [candidate.config.name, candidate]),
    );
    expect(indexes.get("posts_slug_unique")?.config.unique).toBe(true);
    expect(indexes.get("posts_source_key_unique")?.config.unique).toBe(true);
    expect(indexes.get("posts_source_key_unique")?.config.where).toBeDefined();

    expect(config.foreignKeys.some((foreignKey) => {
      const reference = foreignKey.reference();
      return reference.columns[0]?.name === "agent_run_id"
        && reference.foreignTable === serverSchema.agentRuns
        && reference.foreignColumns[0] === serverSchema.agentRuns.id;
    })).toBe(true);
  });

  it("ships generated migration metadata and safe backfill ordering", () => {
    const migrationPath = join(process.cwd(), "drizzle", "0012_m4b_scheduled_agents.sql");
    const snapshotPath = join(process.cwd(), "drizzle", "meta", "0012_snapshot.json");
    expect(existsSync(migrationPath)).toBe(true);
    expect(existsSync(snapshotPath)).toBe(true);
    if (!existsSync(migrationPath) || !existsSync(snapshotPath)) return;

    const migration = readFileSync(migrationPath, "utf8");
    const addAgent = migration.indexOf('ALTER TABLE "agent_runs" ADD COLUMN "agent" "agent_name"');
    const backfill = migration.indexOf(`UPDATE "agent_runs" SET "agent" = 'concierge' WHERE "agent" IS NULL`);
    const requireAgent = migration.indexOf('ALTER TABLE "agent_runs" ALTER COLUMN "agent" SET NOT NULL');
    expect(addAgent).toBeGreaterThan(-1);
    expect(backfill).toBeGreaterThan(addAgent);
    expect(requireAgent).toBeGreaterThan(backfill);

    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as {
      tables?: Record<string, unknown>;
      enums?: Record<string, {values?: readonly string[]}>;
    };
    expect(snapshot.tables).toHaveProperty("public.posts");
    expect(snapshot.enums?.["public.agent_name"]?.values).toEqual([
      "concierge", "retention_analyst", "board_reporter",
    ]);
    expect(snapshot.enums?.["public.post_kind"]?.values).toEqual([
      "news", "buildlog", "page",
    ]);

    const journal = JSON.parse(readFileSync(
      join(process.cwd(), "drizzle", "meta", "_journal.json"),
      "utf8",
    )) as {entries?: Array<{tag?: string}>};
    expect(journal.entries?.some((entry) => entry.tag === "0012_m4b_scheduled_agents")).toBe(true);
  });
});
