import {runM1Seed} from "./seed-m1.ts";
import {runM2Seed} from "./seed-m2.ts";

export async function seedDatabase(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  await runM1Seed(environment);
  await runM2Seed(environment);
}

if (process.argv[1]?.endsWith("db-seed.ts")) {
  seedDatabase().catch(() => {
    console.error("Database seed failed.");
    process.exitCode = 1;
  });
}
