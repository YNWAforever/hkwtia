import {execFile as execFileCallback} from "node:child_process";
import {promisify} from "node:util";

import {Pool} from "@neondatabase/serverless";
import {describe, expect, it} from "vitest";

const execFile = promisify(execFileCallback);

const testDatabaseUrl = process.env.DATABASE_URL_TEST?.trim() ?? "";

async function runDatabaseCommand(command: "db:migrate" | "db:seed") {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const {stdout, stderr} = await execFile(npm, ["run", command], {
    cwd: process.cwd(),
    env: {...process.env, DATABASE_URL: testDatabaseUrl},
    maxBuffer: 2 * 1024 * 1024,
    shell: process.platform === "win32",
  });

  return `${stdout}\n${stderr}`;
}

describe.skipIf(!testDatabaseUrl)("M1 database migration and seed", () => {
  it("migrates and seeds all stable plan codes idempotently", async () => {
    await runDatabaseCommand("db:migrate");
    const firstSeedOutput = await runDatabaseCommand("db:seed");
    const secondSeedOutput = await runDatabaseCommand("db:seed");

    expect(firstSeedOutput).not.toContain(testDatabaseUrl);
    expect(secondSeedOutput).not.toContain(testDatabaseUrl);

    const pool = new Pool({connectionString: testDatabaseUrl});
    try {
      const result = await pool.query<{code: string; count: number}>(
        "SELECT code, count(*)::int AS count FROM membership_plans GROUP BY code ORDER BY code",
      );
      expect(result.rows).toEqual([
        {code: "community", count: 1},
        {code: "corporate", count: 1},
        {code: "patron", count: 1},
        {code: "startup", count: 1},
      ]);
    } finally {
      await pool.end();
    }
  });
});
