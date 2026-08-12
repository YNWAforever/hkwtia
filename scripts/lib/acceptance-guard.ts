/**
 * The one isolation guard for fixture seeds.
 *
 * M5 and M6 each hand-rolled this, and M1, M2 and M3 never got one — which is
 * how `npm run db:seed`, the documented setup command, came to write 30
 * synthetic profiles into whatever `DATABASE_URL` pointed at. Copies are why
 * the gap existed, so new seeds call this rather than writing a sixth.
 *
 * Error codes stay prefixed per seed so existing runbooks and tests that match
 * on `M5_ACCEPTANCE_*` keep working after the refactor.
 *
 * The allowlist's whitespace-or-comma split and the try/catch around the URL
 * parse are carried over from M6 deliberately — do not simplify them away.
 */
export type IsolatedSeedOptions = Readonly<{
  prefix: string;
  flag: string;
  hostAllowlistVar?: string;
}>;

type Environment = Readonly<Record<string, string | undefined>>;

function normalized(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

export function assertIsolatedSeedEnvironment(
  environment: Environment,
  {prefix, flag, hostAllowlistVar}: IsolatedSeedOptions,
): string {
  const fail = (code: string): never => {
    throw new Error(`${prefix}_${code}`);
  };

  if (normalized(environment[flag]) !== "true") fail("SEED_NOT_AUTHORIZED");
  if (normalized(environment.VERCEL_ENV) === "production"
    || normalized(environment.NODE_ENV) === "production") {
    fail("PRODUCTION_FORBIDDEN");
  }

  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) fail("DATABASE_URL_REQUIRED");
  const testDatabaseUrl = environment.DATABASE_URL_TEST?.trim();
  if (!testDatabaseUrl) fail("DATABASE_URL_TEST_REQUIRED");
  if (databaseUrl !== testDatabaseUrl) fail("DATABASE_URL_MISMATCH");

  if (hostAllowlistVar) {
    const allowlist = environment[hostAllowlistVar]
      ?.split(/[\s,]+/).map((entry) => entry.trim().toLowerCase()).filter(Boolean) ?? [];
    if (allowlist.length === 0) fail("DATABASE_HOST_ALLOWLIST_REQUIRED");
    // An allowlisted host is not proof of isolation — the operator still has to
    // confirm that. This only stops an unlisted host, which is the mistake a
    // tired person actually makes.
    const parseHost = (): string => {
      try {
        return new URL(databaseUrl as string).hostname.toLowerCase();
      } catch {
        return fail("DATABASE_URL_INVALID");
      }
    };
    if (!allowlist.includes(parseHost())) fail("DATABASE_HOST_NOT_ALLOWED");
  }

  return databaseUrl as string;
}
