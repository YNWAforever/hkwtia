import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {
  M4B_ACCEPTANCE_OWNERSHIP_KEY,
} from "@/lib/acceptance/m4b-ownership";
import {
  resolveM4BAcceptanceOwnershipKey,
} from "@/lib/acceptance/m4b-runtime-guard";

describe("M4B runtime ownership guard", () => {
  const databaseUrl = "postgres://isolated";
  const valid = {
    M4B_ACCEPTANCE_OWNERSHIP_KEY,
    M4B_ACCEPTANCE_SEED: "true",
    DATABASE_URL: databaseUrl,
    DATABASE_URL_TEST: databaseUrl,
    NODE_ENV: "test",
    VERCEL_ENV: "preview",
  } as const;

  it("is inert when the ownership key is absent", () => {
    expect(resolveM4BAcceptanceOwnershipKey({
      M4B_ACCEPTANCE_SEED: "true",
      DATABASE_URL: "postgres://lingering",
      VERCEL_ENV: "production",
    })).toBeUndefined();
  });

  it("accepts only an explicitly authorized isolated runtime", () => {
    expect(resolveM4BAcceptanceOwnershipKey({
      ...valid,
      DATABASE_URL: ` ${databaseUrl} `,
      DATABASE_URL_TEST: databaseUrl,
    })).toBe(M4B_ACCEPTANCE_OWNERSHIP_KEY);
  });

  it.each([
    [{...valid, M4B_ACCEPTANCE_OWNERSHIP_KEY: ""}, "M4B_ACCEPTANCE_OWNERSHIP_KEY_INVALID"],
    [{...valid, M4B_ACCEPTANCE_OWNERSHIP_KEY: "other"}, "M4B_ACCEPTANCE_OWNERSHIP_KEY_INVALID"],
    [{...valid, M4B_ACCEPTANCE_OWNERSHIP_KEY: "m4b-acceptance-v2"}, "M4B_ACCEPTANCE_OWNERSHIP_KEY_INVALID"],
    [{...valid, M4B_ACCEPTANCE_OWNERSHIP_KEY: "m4b-acceptance-v01"}, "M4B_ACCEPTANCE_OWNERSHIP_KEY_INVALID"],
    [{...valid, M4B_ACCEPTANCE_SEED: "false"}, "M4B_ACCEPTANCE_RUNTIME_NOT_AUTHORIZED"],
    [{...valid, NODE_ENV: ""}, "M4B_ACCEPTANCE_RUNTIME_ENVIRONMENT_REQUIRED"],
    [{...valid, VERCEL_ENV: ""}, "M4B_ACCEPTANCE_RUNTIME_ENVIRONMENT_REQUIRED"],
    [{...valid, NODE_ENV: "production"}, "M4B_ACCEPTANCE_RUNTIME_PRODUCTION_FORBIDDEN"],
    [{...valid, VERCEL_ENV: "production"}, "M4B_ACCEPTANCE_RUNTIME_PRODUCTION_FORBIDDEN"],
    [{...valid, DATABASE_URL: ""}, "M4B_ACCEPTANCE_RUNTIME_DATABASE_URL_REQUIRED"],
    [{...valid, DATABASE_URL_TEST: ""}, "M4B_ACCEPTANCE_RUNTIME_DATABASE_URL_TEST_REQUIRED"],
    [{...valid, DATABASE_URL_TEST: "postgres://other"}, "M4B_ACCEPTANCE_RUNTIME_DATABASE_URL_MISMATCH"],
  ])("rejects an invalid present-key environment before runtime work", (
    environment,
    error,
  ) => {
    expect(() => resolveM4BAcceptanceOwnershipKey(environment))
      .toThrow(error);
  });

  it.each([
    ["runProductionRetentionAnalyst", "runRetentionAnalystService"],
    ["runProductionBoardReporter", "runBoardReporterService"],
  ])("%s guards before server configuration or work", (runner, service) => {
    const source = readFileSync(resolve("lib/jobs/runners.ts"), "utf8");
    const start = source.indexOf(`function ${runner}`);
    const end = source.indexOf("\n}\n", start);
    const body = source.slice(start, end);

    const guard = body.indexOf("resolveM4BAcceptanceOwnershipKey(process.env)");
    expect(guard).toBeGreaterThan(0);

    // Any environment accessor, not one named contract: the guard has to run
    // before configuration is read, whichever helper reads it. Pinning a single
    // name let a rename to a feature-scoped accessor turn this into
    // `indexOf(...) === -1` and quietly invert the assertion.
    const configuration = body.search(/\b[a-z][A-Za-z]*Env\(\)/);
    expect(configuration).toBeGreaterThan(0);
    expect(guard).toBeLessThan(configuration);

    // ...and before the runner does any work.
    const work = body.indexOf(`${service}(`);
    expect(work).toBeGreaterThan(0);
    expect(guard).toBeLessThan(work);
  });
});
