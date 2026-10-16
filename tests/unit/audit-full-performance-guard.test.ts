import { describe, expect, it } from "vitest";
import { resolvePerformanceTarget } from "../../scripts/audit-remediation-performance";
const url =
  "postgresql://synthetic:synthetic@ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const safe = {
  DATABASE_URL: url,
  DATABASE_URL_TEST: url,
  NEON_PROJECT_ID: "solitary-wave-52860119",
  AUDIT_ISOLATED_ACCEPTANCE: "true",
};
describe("performance fixture target guard", () => {
  it("allows the confirmed isolated target and always-owned disposable target", () => {
    expect(resolvePerformanceTarget("neon", safe)).toEqual({
      kind: "neon",
      connectionString: url,
    });
    expect(resolvePerformanceTarget("disposable", {})).toEqual({
      kind: "disposable",
    });
  });
  it.each([
    { ...safe, VERCEL_ENV: "production" },
    { ...safe, NODE_ENV: "production" },
    {
      ...safe,
      DATABASE_URL_TEST: "postgresql://synthetic@production.example.test/db",
    },
    {
      ...safe,
      DATABASE_URL: "postgresql://synthetic@production.example.test/db",
      DATABASE_URL_TEST: "postgresql://synthetic@production.example.test/db",
    },
    { ...safe, NEON_PROJECT_ID: "another-project" },
    { ...safe, AUDIT_ISOLATED_ACCEPTANCE: "false" },
    { ...safe, DATABASE_URL: undefined },
  ])(
    "refuses a hostile or unconfirmed target without opening a database",
    (environment) => {
      expect(() => resolvePerformanceTarget("neon", environment)).toThrow();
    },
  );
  it("refuses unknown targets instead of falling back to a configured database", () => {
    expect(() => resolvePerformanceTarget("production", safe)).toThrow();
  });
});
