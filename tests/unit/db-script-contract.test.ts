import {readFile} from "node:fs/promises";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

type PackageManifest = {scripts?: Record<string, string>};

async function runDbCommand(command: string, env: Record<string, string>) {
  const packageJson = JSON.parse(
    await readFile(resolve(process.cwd(), "package.json"), "utf8"),
  ) as PackageManifest;
  const script = packageJson.scripts?.[command];
  if (!script) {
    throw new Error(`Missing npm command: ${command}`);
  }

  return `${script}\nDATABASE_URL=${env.DATABASE_URL}`;
}

describe("database commands", () => {
  it("does not use the retired unavailable database command", async () => {
    const result = await runDbCommand("db:migrate", {DATABASE_URL: "postgres://test"});
    expect(result).toContain("drizzle-kit migrate");
  });

  it("routes seeding through the TypeScript seed script", async () => {
    const result = await runDbCommand("db:seed", {DATABASE_URL: "postgres://test"});
    expect(result).toContain("scripts/db-seed.ts");
  });
});
