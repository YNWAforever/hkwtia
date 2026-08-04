import {describe, expect, it} from "vitest";

describe("M6 Launch Pad seed", () => {
  it("has stable cohort, partner, and unique application fixture records", async () => {
    const seed = await import("@/scripts/seed-m6");
    const fixture = seed.buildM6SeedFixture(new Date("2030-08-05T00:00:00.000Z"));
    expect(fixture.cohorts).toHaveLength(1);
    expect(fixture.cohorts[0]?.status).toBe("open");
    expect(fixture.partners).toHaveLength(3);
    expect(fixture.applications).toHaveLength(5);
    expect(new Set(fixture.applications.map((row) => `${row.cohortId}:${row.companyId}`)).size).toBe(5);
    expect(fixture.applications.map((row) => row.stage).sort()).toEqual(["accepted", "applied", "land", "match", "ready"]);
    expect(JSON.stringify(fixture)).not.toContain("@");
  });

  it("requires an explicitly isolated, non-production database URL", async () => {
    const seed = await import("@/scripts/seed-m6");
    const isolated = "postgres://isolated";
    expect(() => seed.assertM6SeedEnvironment({DATABASE_URL: isolated, DATABASE_URL_TEST: isolated}))
      .toThrow("M6_ACCEPTANCE_SEED_NOT_AUTHORIZED");
    expect(() => seed.assertM6SeedEnvironment({M6_ACCEPTANCE_SEED: "true", DATABASE_URL: isolated, DATABASE_URL_TEST: `${isolated}-other`}))
      .toThrow("M6_ACCEPTANCE_DATABASE_URL_MISMATCH");
    expect(() => seed.assertM6SeedEnvironment({M6_ACCEPTANCE_SEED: "true", DATABASE_URL: isolated, DATABASE_URL_TEST: isolated, NODE_ENV: "production"}))
      .toThrow("M6_ACCEPTANCE_PRODUCTION_FORBIDDEN");
  });

  it("keeps owned application pairs unique when seeded twice", async () => {
    const seed = await import("@/scripts/seed-m6");
    const applicationPairs = new Set<string>();
    let applicationWrites = 0;
    const connection = {
      query: async (text: string, values?: readonly unknown[]) => {
        if (text.includes("INSERT INTO cohort_applications")) {
          applicationWrites += 1;
          applicationPairs.add(`${values?.[1]}:${values?.[2]}`);
        }
        if (text.includes("M6_ACCEPTANCE_OWNED_COUNT_MISMATCH")) return {rows: []};
        if (text.includes("count(*)::integer AS cohort_count")) {
          return {rows: [{cohort_count: 1, partner_count: 3, application_count: applicationPairs.size, unique_application_pairs: applicationPairs.size}]};
        }
        return {rows: []};
      },
      release: () => undefined,
    };
    const pool = {connect: async () => connection};
    await seed.seedM6(pool, {asOf: new Date("2030-08-05T00:00:00.000Z")});
    await seed.seedM6(pool, {asOf: new Date("2030-08-05T00:00:00.000Z")});
    expect(applicationWrites).toBe(10);
    expect(applicationPairs.size).toBe(5);
  });
});
