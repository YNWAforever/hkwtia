export function seedDatabase(environment: NodeJS.ProcessEnv = process.env): string {
  if (!(environment.DATABASE_URL ?? "").trim()) {
    throw new Error("DATABASE_URL is required to seed the database.");
  }

  // M1's schema seed rows are added with the schema task; keep this command
  // explicit and side-effect free until that migration is present.
  return "Database seed command is ready.";
}

if (process.argv[1]?.endsWith("db-seed.ts")) {
  try {
    if (process.argv.includes("--print-status")) {
      console.log(seedDatabase());
    } else {
      seedDatabase();
    }
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : "Database seed failed.");
    process.exitCode = 1;
  }
}
