import {describe, expect, it} from "vitest";

describe("M5 Showcase acceptance seed", () => {
  it("exports a deterministic fixture with published, premium, and review rows", async () => {
    const seed = await import("@/scripts/seed-m5");
    const fixture = seed.buildM5SeedFixture(new Date("2030-07-15T02:00:00.000Z"));

    expect(fixture.listings).toHaveLength(3);
    expect(fixture.listings.filter(({status}) => status === "published")).toHaveLength(2);
    expect(fixture.listings.filter(({status}) => status === "pending_review")).toHaveLength(1);
    expect(fixture.listings.filter(({premium}) => premium)).toEqual([
      expect.objectContaining({slug: "harbour-vision-ai", category: "software"}),
    ]);
    expect(fixture.listings.map(({slug}) => slug).sort()).toEqual([
      "harbour-vision-ai", "jade-logistics-platform", "lion-rock-cyber",
    ]);
    expect(JSON.stringify(fixture)).not.toContain("@gmail.com");
  });

  it("rejects missing authorization, mismatched URLs, and production", async () => {
    const seed = await import("@/scripts/seed-m5");
    const isolated = "postgres://isolated";
    expect(() => seed.assertM5SeedEnvironment({DATABASE_URL: isolated, DATABASE_URL_TEST: isolated}))
      .toThrow("M5_ACCEPTANCE_SEED_NOT_AUTHORIZED");
    expect(() => seed.assertM5SeedEnvironment({M5_ACCEPTANCE_SEED: "true", DATABASE_URL: isolated, DATABASE_URL_TEST: `${isolated}-other`}))
      .toThrow("M5_ACCEPTANCE_DATABASE_URL_MISMATCH");
    expect(() => seed.assertM5SeedEnvironment({M5_ACCEPTANCE_SEED: "true", DATABASE_URL: isolated, DATABASE_URL_TEST: isolated, NODE_ENV: "production"}))
      .toThrow("M5_ACCEPTANCE_PRODUCTION_FORBIDDEN");
  });
});
