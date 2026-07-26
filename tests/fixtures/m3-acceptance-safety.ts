export const M3_ACCEPTANCE_DESTRUCTIVE_SENTINEL =
  "isolated-preview";

type AcceptanceEnvironment =
  Readonly<Record<string, string | undefined>>;

export type M3AcceptanceDatabase = Readonly<{
  databaseUrl: string;
  hostname: string;
  databaseName: string;
}>;

const TLS_SSL_MODES = new Set([
  "require",
  "verify-ca",
  "verify-full",
]);
const PRODUCTION_HOST_LABEL = /(^|[.-])(prod|production)([.-]|$)/;

function normalizedHostname(value: string): string {
  return value.trim().toLowerCase().replace(/\.+$/, "");
}

function parseDatabaseUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("M3_ACCEPTANCE_DATABASE_URL_INVALID");
  }
  if (
    (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:")
    || !parsed.username
    || !parsed.password
    || parsed.hash
  ) {
    throw new Error("M3_ACCEPTANCE_DATABASE_URL_INVALID");
  }
  return parsed;
}

function databaseName(parsed: URL): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    throw new Error("M3_ACCEPTANCE_DATABASE_NAME_REQUIRED");
  }
  if (!decoded || decoded.includes("/")) {
    throw new Error("M3_ACCEPTANCE_DATABASE_NAME_REQUIRED");
  }
  return decoded;
}

function connectionIdentity(parsed: URL): string {
  return [
    normalizedHostname(parsed.hostname),
    parsed.port || "5432",
    databaseName(parsed),
  ].join(":");
}

export function requireM3AcceptanceDatabase(
  environment: AcceptanceEnvironment,
): M3AcceptanceDatabase {
  const databaseUrl = environment.DATABASE_URL_TEST?.trim();
  if (!databaseUrl) {
    throw new Error("M3_ACCEPTANCE_DATABASE_URL_REQUIRED");
  }
  if (
    environment.M3_ACCEPTANCE_ALLOW_DESTRUCTIVE?.trim()
    !== M3_ACCEPTANCE_DESTRUCTIVE_SENTINEL
  ) {
    throw new Error("M3_ACCEPTANCE_DESTRUCTIVE_SENTINEL_REQUIRED");
  }

  const expectedHostname = normalizedHostname(
    environment.M3_ACCEPTANCE_EXPECTED_DB_HOST ?? "",
  );
  if (!expectedHostname) {
    throw new Error("M3_ACCEPTANCE_EXPECTED_DB_HOST_REQUIRED");
  }
  if (
    !/^[a-z0-9.-]+$/.test(expectedHostname)
    || !expectedHostname.endsWith(".neon.tech")
  ) {
    throw new Error("M3_ACCEPTANCE_EXPECTED_DB_HOST_INVALID");
  }

  const parsed = parseDatabaseUrl(databaseUrl);
  const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();
  if (!sslMode || !TLS_SSL_MODES.has(sslMode)) {
    throw new Error("M3_ACCEPTANCE_DATABASE_TLS_REQUIRED");
  }

  const hostname = normalizedHostname(parsed.hostname);
  if (!hostname.endsWith(".neon.tech")) {
    throw new Error("M3_ACCEPTANCE_NEON_DATABASE_REQUIRED");
  }
  const selectedDatabase = databaseName(parsed);
  if (PRODUCTION_HOST_LABEL.test(hostname)) {
    throw new Error("M3_ACCEPTANCE_PRODUCTION_DATABASE_FORBIDDEN");
  }
  if (hostname !== expectedHostname) {
    throw new Error("M3_ACCEPTANCE_DATABASE_HOST_MISMATCH");
  }

  const runtimeUrl = environment.DATABASE_URL?.trim();
  if (runtimeUrl) {
    const runtime = parseDatabaseUrl(runtimeUrl);
    if (connectionIdentity(runtime) === connectionIdentity(parsed)) {
      throw new Error(
        "M3_ACCEPTANCE_RUNTIME_DATABASE_REUSE_FORBIDDEN",
      );
    }
  }

  return {
    databaseUrl,
    hostname,
    databaseName: selectedDatabase,
  };
}

export type M3E2ETarget = Readonly<{
  baseUrl: string;
  origin: string;
  isLoopback: boolean;
}>;

const LOOPBACK_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
]);
const VERCEL_PREVIEW_HOST =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/;

function parseOriginUrl(value: string, errorCode: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(errorCode);
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || (parsed.pathname !== "" && parsed.pathname !== "/")
  ) {
    throw new Error(errorCode);
  }
  return parsed;
}

export function requireM3E2ETarget(
  environment: AcceptanceEnvironment,
): M3E2ETarget {
  const configuredTarget = environment.PLAYWRIGHT_BASE_URL?.trim();
  if (!configuredTarget) {
    throw new Error("M3_E2E_TARGET_REQUIRED");
  }

  const target = parseOriginUrl(
    configuredTarget,
    "M3_E2E_TARGET_INVALID",
  );
  const hostname = normalizedHostname(target.hostname);
  const isLoopback = LOOPBACK_HOSTNAMES.has(hostname);
  if (isLoopback) {
    return {
      baseUrl: target.origin,
      origin: target.origin,
      isLoopback: true,
    };
  }

  if (target.protocol !== "https:") {
    throw new Error("M3_E2E_REMOTE_HTTPS_REQUIRED");
  }
  if (hostname === "hkwtia.vercel.app") {
    throw new Error("M3_E2E_PRODUCTION_TARGET_FORBIDDEN");
  }
  if (!VERCEL_PREVIEW_HOST.test(hostname)) {
    throw new Error("M3_E2E_VERCEL_PREVIEW_REQUIRED");
  }

  const configuredAllowedOrigin =
    environment.M3_E2E_ALLOWED_ORIGIN?.trim();
  if (!configuredAllowedOrigin) {
    throw new Error("M3_E2E_ALLOWED_ORIGIN_REQUIRED");
  }
  const allowed = parseOriginUrl(
    configuredAllowedOrigin,
    "M3_E2E_ALLOWED_ORIGIN_INVALID",
  );
  if (
    configuredAllowedOrigin !== allowed.origin
    || allowed.protocol !== "https:"
  ) {
    throw new Error("M3_E2E_ALLOWED_ORIGIN_INVALID");
  }
  if (allowed.origin !== target.origin) {
    throw new Error("M3_E2E_TARGET_ORIGIN_MISMATCH");
  }

  return {
    baseUrl: target.origin,
    origin: target.origin,
    isLoopback: false,
  };
}

type M3AcceptanceCaseDependencies = Readonly<{
  clean: () => Promise<void>;
  seed: () => Promise<void>;
}>;

export type M3AcceptanceCaseLifecycle = Readonly<{
  prepare: () => Promise<void>;
  cleanup: () => Promise<void>;
}>;

export function createM3AcceptanceCaseLifecycle(
  dependencies: M3AcceptanceCaseDependencies,
): M3AcceptanceCaseLifecycle {
  return {
    async prepare() {
      await dependencies.clean();
      await dependencies.seed();
    },
    async cleanup() {
      await dependencies.clean();
    },
  };
}
