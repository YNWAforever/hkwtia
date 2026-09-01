import {describe, expect, it} from "vitest";

import {assertIsolatedSeedEnvironment, assertSeedSentinel} from "@/scripts/lib/acceptance-guard";

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

  // M6 splits its allowlist on whitespace or commas (scripts/seed-m6.ts:112). A
  // comma-only split silently turns a whitespace-separated list into one bogus
  // host and locks out a host that is legitimately listed.
  it.each([
    ["whitespace-separated", "a.test b.test"],
    ["comma-separated", "a.test,b.test"],
    ["mixed comma-and-whitespace", "a.test, b.test"],
  ])("accepts a %s host allowlist", (_case, allowlistValue) => {
    const options = {
      prefix: "M6_ACCEPTANCE",
      flag: "M6_ACCEPTANCE_SEED",
      hostAllowlistVar: "M6_ACCEPTANCE_DATABASE_HOST_ALLOWLIST",
    };
    const environment = {
      M6_ACCEPTANCE_SEED: "true",
      DATABASE_URL: "postgres://a.test/wtia",
      DATABASE_URL_TEST: "postgres://a.test/wtia",
      NODE_ENV: "test",
      M6_ACCEPTANCE_DATABASE_HOST_ALLOWLIST: allowlistValue,
    };

    expect(assertIsolatedSeedEnvironment(environment, options)).toBe("postgres://a.test/wtia");
  });

  // M6 wraps its URL parse and rethrows a prefixed code (scripts/seed-m6.ts:117-121)
  // rather than letting a raw `new URL()` TypeError escape.
  it("throws the prefixed code, not a raw TypeError, for a malformed database url", () => {
    const options = {
      prefix: "M6_ACCEPTANCE",
      flag: "M6_ACCEPTANCE_SEED",
      hostAllowlistVar: "M6_ACCEPTANCE_DATABASE_HOST_ALLOWLIST",
    };
    const environment = {
      M6_ACCEPTANCE_SEED: "true",
      DATABASE_URL: "not-a-url",
      DATABASE_URL_TEST: "not-a-url",
      NODE_ENV: "test",
      M6_ACCEPTANCE_DATABASE_HOST_ALLOWLIST: "a.test",
    };

    expect.assertions(2);
    try {
      assertIsolatedSeedEnvironment(environment, options);
    } catch (error) {
      expect(error).not.toBeInstanceOf(TypeError);
      expect(error).toHaveProperty("message", "M6_ACCEPTANCE_DATABASE_URL_INVALID");
    }
  });
});

describe("seed sentinel", () => {
  it("rejects a database with no sentinel row", async () => {
    await expect(
      assertSeedSentinel("M5_ACCEPTANCE", async () => 0),
    ).rejects.toThrow("M5_ACCEPTANCE_SENTINEL_REQUIRED");
  });

  it("accepts a database whose sentinel is present", async () => {
    await expect(
      assertSeedSentinel("M5_ACCEPTANCE", async () => 1),
    ).resolves.toBeUndefined();
  });

  // More than one row means something other than provisioning wrote to the
  // table, so the marker no longer evidences a single deliberate act.
  it("rejects a sentinel table with more than one row", async () => {
    await expect(
      assertSeedSentinel("M5_ACCEPTANCE", async () => 2),
    ).rejects.toThrow("M5_ACCEPTANCE_SENTINEL_AMBIGUOUS");
  });

  it("surfaces a query failure rather than treating it as absence", async () => {
    await expect(
      assertSeedSentinel("M5_ACCEPTANCE", async () => {
        throw new Error('relation "acceptance_sentinel" does not exist');
      }),
    ).rejects.toThrow("M5_ACCEPTANCE_SENTINEL_UNREADABLE");
  });
});
