import {describe, expect, it} from "vitest";

import {assertIsolatedSeedEnvironment} from "@/scripts/lib/acceptance-guard";

const prefix = "M5_ACCEPTANCE";
const valid = {
  M5_ACCEPTANCE_SEED: "true",
  DATABASE_URL: "postgres://db.test/wtia",
  DATABASE_URL_TEST: "postgres://db.test/wtia",
  NODE_ENV: "test",
} as const;

describe("isolated seed guard", () => {
  it("returns the database url when every condition holds", () => {
    expect(assertIsolatedSeedEnvironment(valid, {prefix, flag: "M5_ACCEPTANCE_SEED"}))
      .toBe("postgres://db.test/wtia");
  });

  it.each([
    ["SEED_NOT_AUTHORIZED", {...valid, M5_ACCEPTANCE_SEED: "false"}],
    ["PRODUCTION_FORBIDDEN", {...valid, NODE_ENV: "production"}],
    ["PRODUCTION_FORBIDDEN", {...valid, VERCEL_ENV: "production"}],
    ["DATABASE_URL_REQUIRED", {...valid, DATABASE_URL: ""}],
    ["DATABASE_URL_TEST_REQUIRED", {...valid, DATABASE_URL_TEST: ""}],
    ["DATABASE_URL_MISMATCH", {...valid, DATABASE_URL_TEST: "postgres://other.test/wtia"}],
  ])("throws %s", (code, environment) => {
    expect(() => assertIsolatedSeedEnvironment(environment, {prefix, flag: "M5_ACCEPTANCE_SEED"}))
      .toThrow(`${prefix}_${code}`);
  });

  it("enforces a host allowlist only when one is required", () => {
    const options = {
      prefix: "M6_ACCEPTANCE",
      flag: "M6_ACCEPTANCE_SEED",
      hostAllowlistVar: "M6_ACCEPTANCE_DATABASE_HOST_ALLOWLIST",
    };
    const base = {
      M6_ACCEPTANCE_SEED: "true",
      DATABASE_URL: "postgres://db.test/wtia",
      DATABASE_URL_TEST: "postgres://db.test/wtia",
      NODE_ENV: "test",
    };

    expect(() => assertIsolatedSeedEnvironment(base, options))
      .toThrow("M6_ACCEPTANCE_DATABASE_HOST_ALLOWLIST_REQUIRED");
    expect(() => assertIsolatedSeedEnvironment(
      {...base, M6_ACCEPTANCE_DATABASE_HOST_ALLOWLIST: "elsewhere.test"}, options,
    )).toThrow("M6_ACCEPTANCE_DATABASE_HOST_NOT_ALLOWED");
    expect(assertIsolatedSeedEnvironment(
      {...base, M6_ACCEPTANCE_DATABASE_HOST_ALLOWLIST: "db.test"}, options,
    )).toBe("postgres://db.test/wtia");
  });
});
