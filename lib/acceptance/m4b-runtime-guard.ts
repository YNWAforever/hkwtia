type RuntimeEnvironment =
  Readonly<Record<string, string | undefined>>;

const OWNERSHIP_KEY_PATTERN = /^m4b-acceptance-v\d+$/;

export function resolveM4BAcceptanceOwnershipKey(
  environment: RuntimeEnvironment,
): string | undefined {
  const configuredKey = environment.M4B_ACCEPTANCE_OWNERSHIP_KEY;
  if (configuredKey === undefined) return undefined;

  const ownershipKey = configuredKey.trim();
  if (!OWNERSHIP_KEY_PATTERN.test(ownershipKey)) {
    throw new Error("M4B_ACCEPTANCE_OWNERSHIP_KEY_INVALID");
  }
  if (environment.M4B_ACCEPTANCE_SEED?.trim().toLowerCase() !== "true") {
    throw new Error("M4B_ACCEPTANCE_RUNTIME_NOT_AUTHORIZED");
  }

  const nodeEnvironment = environment.NODE_ENV?.trim().toLowerCase();
  const vercelEnvironment = environment.VERCEL_ENV?.trim().toLowerCase();
  if (!nodeEnvironment || !vercelEnvironment) {
    throw new Error("M4B_ACCEPTANCE_RUNTIME_ENVIRONMENT_REQUIRED");
  }
  if (
    nodeEnvironment === "production"
    || vercelEnvironment === "production"
  ) {
    throw new Error("M4B_ACCEPTANCE_RUNTIME_PRODUCTION_FORBIDDEN");
  }

  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("M4B_ACCEPTANCE_RUNTIME_DATABASE_URL_REQUIRED");
  }
  const testDatabaseUrl = environment.DATABASE_URL_TEST?.trim();
  if (!testDatabaseUrl) {
    throw new Error("M4B_ACCEPTANCE_RUNTIME_DATABASE_URL_TEST_REQUIRED");
  }
  if (databaseUrl !== testDatabaseUrl) {
    throw new Error("M4B_ACCEPTANCE_RUNTIME_DATABASE_URL_MISMATCH");
  }
  return ownershipKey;
}
