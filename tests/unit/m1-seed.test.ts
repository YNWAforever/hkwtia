import {describe, expect, it, vi} from "vitest";

import {M1_PLAN_ROWS, runM1Seed, seedM1Plans} from "@/scripts/seed-m1";

describe("M1 plan seed", () => {
  it("upserts exactly the four stable plan rows without personal data", async () => {
    const queries: Array<{text: string; values: unknown[] | undefined}> = [];
    const client = {query: vi.fn(async (text: string, values?: unknown[]) => {queries.push({text, values});})};

    await seedM1Plans(client);

    expect(queries).toHaveLength(4);
    expect(queries.every(({text}) => text.includes("ON CONFLICT (code) DO UPDATE"))).toBe(true);
    expect(queries.map(({values}) => values?.[0])).toEqual(M1_PLAN_ROWS.map((plan) => plan.code));
    expect(queries.flatMap(({values}) => values ?? []).some((value) => typeof value === "string" && value.includes("@"))).toBe(false);
  });

  it("fails before opening a connection when DATABASE_URL is missing", async () => {
    await expect(runM1Seed({DATABASE_URL: "", NODE_ENV: "test"} as NodeJS.ProcessEnv)).rejects.toThrow("DATABASE_URL is required");
  });
});
