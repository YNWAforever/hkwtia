import {readFile} from "node:fs/promises";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {migrationProcessInvocation, requireDatabaseUrl} from "@/scripts/db-migrate";

type PackageManifest = {scripts?: Record<string, string>};

async function runDbCommand(command: string, env: Record<string, string>) {
  const packageJson = JSON.parse(
    await readFile(resolve(process.cwd(), "package.json"), "utf8"),
  ) as PackageManifest;
  const script = packageJson.scripts?.[command];
  if (!script) {
    throw new Error(`Missing npm command: ${command}`);
  }

  let implementation = "";
  if (script.includes("scripts/db-migrate.ts")) {
    implementation = await readFile(resolve(process.cwd(), "scripts/db-migrate.ts"), "utf8");
  }
  if (script.includes("scripts/db-seed.ts")) {
    implementation = await readFile(resolve(process.cwd(), "scripts/db-seed.ts"), "utf8");
  }

  return `${script}\n${implementation}\nDATABASE_URL=${env.DATABASE_URL}`;
}

describe("database commands", () => {
  it("does not use the retired unavailable database command", async () => {
    const result = await runDbCommand("db:migrate", {DATABASE_URL: "postgres://test"});
    expect(result).toContain("drizzle-kit migrate");
  });

  it("uses a fixed cmd.exe invocation for the Windows Drizzle Kit shim", () => {
    expect(migrationProcessInvocation("win32")).toEqual({
      executable: "cmd.exe",
      args: ["/d", "/s", "/c", "drizzle-kit.cmd migrate --config=drizzle.config.ts"],
    });
  });

  it("requires a database URL without exposing its value", () => {
    expect(() => requireDatabaseUrl({DATABASE_URL: "", NODE_ENV: "test"} as NodeJS.ProcessEnv)).toThrow("DATABASE_URL is required");
    expect(requireDatabaseUrl({DATABASE_URL: " postgres://test ", NODE_ENV: "test"} as NodeJS.ProcessEnv)).toBe("postgres://test");
  });

  it("routes seeding through the TypeScript seed script", async () => {
    const result = await runDbCommand("db:seed", {DATABASE_URL: "postgres://test"});
    expect(result).toContain("scripts/db-seed.ts");
  });
});
