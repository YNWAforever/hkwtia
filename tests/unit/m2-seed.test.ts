import {describe, expect, it, vi} from "vitest";

import {
  M2_AT_RISK_PROFILE_IDS,
  M2_COMPANY_ROWS,
  M2_ENGAGEMENT_SCORE_ROWS,
  M2_PROFILE_ROWS,
  M2_REFERENCE_INSTANT,
  M2_UUIDS,
  runM2Seed,
  seedM2,
} from "@/scripts/seed-m2";

describe("M2 deterministic seed", () => {
  it("defines the exact three at-risk fixtures", () => {
    expect(M2_AT_RISK_PROFILE_IDS).toEqual(["m2-risk-01", "m2-risk-02", "m2-risk-03"]);
    expect(M2_PROFILE_ROWS).toHaveLength(30);
    expect(M2_COMPANY_ROWS).toHaveLength(12);
  });

  it("engineers Branch A only, Branch B only, and both branches without breaking the canonical low-score segment", () => {
    expect(M2_PROFILE_ROWS.find((row) => row.id === "m2-risk-01")?.lastLoginAt).not.toBeNull();
    expect(M2_PROFILE_ROWS.find((row) => row.id === "m2-risk-02")?.lastLoginAt).toBeNull();
    expect(M2_PROFILE_ROWS.find((row) => row.id === "m2-risk-03")?.lastLoginAt).toBeNull();
    expect(M2_ENGAGEMENT_SCORE_ROWS.filter((row) => row.profileId.startsWith("m2-risk-")).map(({score, trend}) => ({score, trend}))).toEqual([{score: 8, trend: -4}, {score: 14, trend: 0}, {score: 19, trend: -2}]);
  });
  it("contains one staff, one exco, and one superadmin", () => {
    expect(M2_PROFILE_ROWS.filter((row) => row.role !== "member").map((row) => row.role).sort())
      .toEqual(["exco", "staff", "superadmin"]);
  });

  it("uses only deterministic non-personal fixture identities", () => {
    expect(M2_REFERENCE_INSTANT.toISOString()).toBe("2026-07-21T00:00:00.000Z");
    expect(M2_PROFILE_ROWS.every((row) => row.email.endsWith(".example.test"))).toBe(true);
    expect(M2_PROFILE_ROWS.map((row) => row.id)).toEqual([...new Set(M2_PROFILE_ROWS.map((row) => row.id))]);
    expect(Object.values(M2_UUIDS).flat().every((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/.test(value))).toBe(true);
  });

  it("uses one checked-out transaction and deterministic conflict policies", async () => {
    const statements: string[] = [];
    const release = vi.fn();
    const query = vi.fn(async (text: string) => { statements.push(text); return {rows: []}; });

    await seedM2({connect: vi.fn(async () => ({query, release}))});

    expect(statements[0]).toBe("BEGIN");
    expect(statements.at(-1)).toBe("COMMIT");
    expect(statements.some((text) => text.includes("ON CONFLICT") && text.includes("DO UPDATE"))).toBe(true);
    expect(statements.some((text) => text.includes("ON CONFLICT") && text.includes("DO NOTHING"))).toBe(true);
    expect(statements.some((text) => /\bnow\s*\(/i.test(text))).toBe(false);
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back and releases the checked-out connection", async () => {
    const statements: string[] = [];
    const release = vi.fn();
    const query = vi.fn(async (text: string) => {
      statements.push(text);
      if (statements.length === 3) throw new Error("fixture write failed");
      return {rows: []};
    });

    await expect(seedM2({connect: vi.fn(async () => ({query, release}))})).rejects.toThrow("fixture write failed");

    expect(statements.at(-1)).toBe("ROLLBACK");
    expect(statements).not.toContain("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("rejects a missing database URL without opening a pool", async () => {
    await expect(runM2Seed({DATABASE_URL: "", NODE_ENV: "test"} as NodeJS.ProcessEnv)).rejects.toThrow("DATABASE_URL is required");
  });
});