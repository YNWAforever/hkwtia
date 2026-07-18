import {runM1Seed} from "./seed-m1.ts";

export function seedDatabase(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  return runM1Seed(environment);
}

if (process.argv[1]?.endsWith("db-seed.ts")) {
  seedDatabase().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Database seed failed.");
    process.exitCode = 1;
  });
}
