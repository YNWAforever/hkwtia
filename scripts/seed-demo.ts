import {assertIsolatedSeedEnvironment} from "./lib/acceptance-guard.ts";
import {runM2Seed} from "./seed-m2.ts";

export const DEMO_SEED_ENV = "DEMO_ACCEPTANCE_SEED";

export async function seedDemoData(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  assertIsolatedSeedEnvironment(environment, {
    prefix: "DEMO_ACCEPTANCE",
    flag: DEMO_SEED_ENV,
  });
  await runM2Seed(environment);
}

if (process.argv[1]?.endsWith("seed-demo.ts")) {
  seedDemoData().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Demo seed failed.");
    process.exitCode = 1;
  });
}
