import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {
  M3_ACCEPTANCE_DESTRUCTIVE_SENTINEL,
  requireM3AcceptanceDatabase,
} from "@/tests/fixtures/m3-acceptance-safety";

const PREVIEW_HOST =
  "ep-m3-preview.ap-southeast-1.aws.neon.tech";
const PREVIEW_DATABASE_URL =
  `postgresql://m3_fixture:test-only@${PREVIEW_HOST}`
  + "/m3_acceptance?sslmode=require";
const integrationSource = readFileSync(
  resolve(
    process.cwd(),
    "tests/integration/m3-acceptance.test.ts",
  ),
  "utf8",
);

function allowedEnvironment(
  overrides: Readonly<Record<string, string | undefined>> = {},
): Readonly<Record<string, string | undefined>> {
  return {
    DATABASE_URL_TEST: PREVIEW_DATABASE_URL,
    M3_ACCEPTANCE_ALLOW_DESTRUCTIVE:
      M3_ACCEPTANCE_DESTRUCTIVE_SENTINEL,
    M3_ACCEPTANCE_EXPECTED_DB_HOST: PREVIEW_HOST,
    ...overrides,
  };
}

describe("M3 destructive acceptance database guard", () => {
  it("requires the isolated test database URL", () => {
    expect(() => requireM3AcceptanceDatabase({
      M3_ACCEPTANCE_ALLOW_DESTRUCTIVE:
        M3_ACCEPTANCE_DESTRUCTIVE_SENTINEL,
      M3_ACCEPTANCE_EXPECTED_DB_HOST: PREVIEW_HOST,
    })).toThrow("M3_ACCEPTANCE_DATABASE_URL_REQUIRED");
  });

  it("requires the exact destructive acceptance sentinel", () => {
    expect(() => requireM3AcceptanceDatabase({
      DATABASE_URL_TEST: PREVIEW_DATABASE_URL,
      M3_ACCEPTANCE_EXPECTED_DB_HOST: PREVIEW_HOST,
    })).toThrow("M3_ACCEPTANCE_DESTRUCTIVE_SENTINEL_REQUIRED");
    expect(() => requireM3AcceptanceDatabase(allowedEnvironment({
      M3_ACCEPTANCE_ALLOW_DESTRUCTIVE: "yes",
    }))).toThrow("M3_ACCEPTANCE_DESTRUCTIVE_SENTINEL_REQUIRED");
  });

  it("requires an independently configured expected Neon host", () => {
    expect(() => requireM3AcceptanceDatabase(allowedEnvironment({
      M3_ACCEPTANCE_EXPECTED_DB_HOST: undefined,
    }))).toThrow("M3_ACCEPTANCE_EXPECTED_DB_HOST_REQUIRED");
  });

  it("rejects invalid, non-TLS, non-Neon, and localhost URLs", () => {
    const rejected = [
      {
        url: "not-a-url",
        host: PREVIEW_HOST,
        error: "M3_ACCEPTANCE_DATABASE_URL_INVALID",
      },
      {
        url:
          `postgresql://m3_fixture:test-only@${PREVIEW_HOST}`
          + "/m3_acceptance",
        host: PREVIEW_HOST,
        error: "M3_ACCEPTANCE_DATABASE_TLS_REQUIRED",
      },
      {
        url:
          "postgresql://m3_fixture:test-only@db.example.test"
          + "/m3_acceptance?sslmode=require",
        host: PREVIEW_HOST,
        error: "M3_ACCEPTANCE_NEON_DATABASE_REQUIRED",
      },
      {
        url:
          "postgresql://m3_fixture:test-only@localhost"
          + "/m3_acceptance?sslmode=require",
        host: PREVIEW_HOST,
        error: "M3_ACCEPTANCE_NEON_DATABASE_REQUIRED",
      },
      {
        url:
          `postgresql://m3_fixture:test-only@${PREVIEW_HOST}`
          + "/?sslmode=require",
        host: PREVIEW_HOST,
        error: "M3_ACCEPTANCE_DATABASE_NAME_REQUIRED",
      },
    ] as const;

    for (const {url, host, error} of rejected) {
      expect(
        () => requireM3AcceptanceDatabase(allowedEnvironment({
          DATABASE_URL_TEST: url,
          M3_ACCEPTANCE_EXPECTED_DB_HOST: host,
        })),
        url,
      ).toThrow(error);
    }
  });

  it.each([
    [
      "safe value before conflicting disable",
      "sslmode=require&sslmode=disable",
    ],
    [
      "disable before safe value",
      "sslmode=disable&sslmode=require",
    ],
    [
      "duplicate safe values",
      "sslmode=require&sslmode=require",
    ],
    [
      "upper-case value",
      "sslmode=REQUIRE",
    ],
    [
      "percent-encoded value",
      "sslmode=%72equire",
    ],
    [
      "upper-case key",
      "SSLMODE=require",
    ],
    [
      "percent-encoded key",
      "%73slmode=require",
    ],
  ])("rejects non-canonical or repeated sslmode: %s", (_case, query) => {
    expect(() => requireM3AcceptanceDatabase(allowedEnvironment({
      DATABASE_URL_TEST:
        `postgresql://m3_fixture:test-only@${PREVIEW_HOST}`
        + `/m3_acceptance?${query}`,
    }))).toThrow("M3_ACCEPTANCE_DATABASE_TLS_REQUIRED");
  });

  it("rejects expected-host mismatch after normalizing case and trailing dots", () => {
    expect(() => requireM3AcceptanceDatabase(allowedEnvironment({
      M3_ACCEPTANCE_EXPECTED_DB_HOST:
        "ep-other-preview.ap-southeast-1.aws.neon.tech",
    }))).toThrow("M3_ACCEPTANCE_DATABASE_HOST_MISMATCH");
  });

  it("rejects a production-labeled or current runtime database", () => {
    const productionHost =
      "ep-production.ap-southeast-1.aws.neon.tech";
    const productionUrl =
      `postgresql://m3_fixture:test-only@${productionHost}`
      + "/neondb?sslmode=require";
    expect(() => requireM3AcceptanceDatabase(allowedEnvironment({
      DATABASE_URL_TEST: productionUrl,
      M3_ACCEPTANCE_EXPECTED_DB_HOST: productionHost,
    }))).toThrow("M3_ACCEPTANCE_PRODUCTION_DATABASE_FORBIDDEN");
    expect(() => requireM3AcceptanceDatabase(allowedEnvironment({
      DATABASE_URL: PREVIEW_DATABASE_URL,
    }))).toThrow("M3_ACCEPTANCE_RUNTIME_DATABASE_REUSE_FORBIDDEN");
  });

  it("accepts only the exact allowlisted Preview host with normalization", () => {
    const guarded = requireM3AcceptanceDatabase(allowedEnvironment({
      DATABASE_URL_TEST:
        "postgresql://m3_fixture:test-only@"
        + "EP-M3-PREVIEW.AP-SOUTHEAST-1.AWS.NEON.TECH."
        + "/m3_acceptance?sslmode=verify-full",
      M3_ACCEPTANCE_EXPECTED_DB_HOST:
        "EP-M3-PREVIEW.AP-SOUTHEAST-1.AWS.NEON.TECH.",
    }));

    expect(guarded.hostname).toBe(PREVIEW_HOST);
    expect(guarded.databaseName).toBe("m3_acceptance");
    expect(guarded.databaseUrl).toContain("sslmode=verify-full");
  });

  it("guards the integration target before constructing a pool", () => {
    const guardCall = integrationSource.indexOf(
      "requireM3AcceptanceDatabase(process.env)",
    );
    const poolConstruction = integrationSource.indexOf(
      "new Pool({connectionString: testDatabaseUrl})",
    );

    expect(guardCall).toBeGreaterThan(-1);
    expect(poolConstruction).toBeGreaterThan(guardCall);
    expect(integrationSource).not.toContain(
      "const testDatabaseUrl = "
      + "process.env.DATABASE_URL_TEST?.trim()",
    );
  });
});
