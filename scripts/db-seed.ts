import {runM1Seed} from "./seed-m1.ts";

/**
 * The M1 plan rows are real product configuration — every environment needs
 * them, including production. The M2 demo fixtures used to run here too, which
 * made the documented setup command a way to put 30 synthetic profiles into a
 * live database. They now live behind the guard in `scripts/seed-demo.ts`.
 */
export async function seedDatabase(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  await runM1Seed(environment);
}

if (process.argv[1]?.endsWith("db-seed.ts")) {
  seedDatabase().catch((error: unknown) => {
    // Previously this printed a fixed string and discarded the cause, which
    // turned a partial seed into a mystery.
    console.error(error instanceof Error ? error.message : "Database seed failed.");
    process.exitCode = 1;
  });
}
