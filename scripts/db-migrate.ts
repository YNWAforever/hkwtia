import {spawn} from "node:child_process";

const migrationCommand = "drizzle-kit migrate --config=drizzle.config.ts";
const migrationArgs = ["migrate", "--config=drizzle.config.ts"];

export function migrationCommandText(): string {
  return migrationCommand;
}

export function runMigration(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (!(environment.DATABASE_URL ?? "").trim()) {
    return Promise.reject(new Error("DATABASE_URL is required to run database migrations."));
  }

  const executable = process.platform === "win32" ? "drizzle-kit.cmd" : "drizzle-kit";

  return new Promise((resolve, reject) => {
    const child = spawn(executable, migrationArgs, {
      env: environment,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Database migration failed${signal ? ` (${signal})` : ` with exit code ${code ?? "unknown"}`}.`));
    });
  });
}

if (process.argv[1]?.endsWith("db-migrate.ts")) {
  if (process.argv.includes("--print-command")) {
    console.log(migrationCommandText());
  } else {
    runMigration().catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Database migration failed.");
      process.exitCode = 1;
    });
  }
}
