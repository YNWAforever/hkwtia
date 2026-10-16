import {describe, expect, it, vi} from "vitest";

import {resetM2AuthenticatedFixtures} from "@/tests/fixtures/m2-reset";

describe("isolated M2 authenticated fixture reset", () => {
  it("skips without DATABASE_URL_TEST and never opens a connection", async () => {
    const connect = vi.fn();
    await expect(resetM2AuthenticatedFixtures({}, {connect, seed: vi.fn()})).resolves.toBe("skipped");
    expect(connect).not.toHaveBeenCalled();
  });

  it("rejects unless runtime DATABASE_URL exactly equals DATABASE_URL_TEST", async () => {
    const connect = vi.fn();
    await expect(resetM2AuthenticatedFixtures({DATABASE_URL_TEST: "isolated", DATABASE_URL: "different"}, {connect, seed: vi.fn()}))
      .rejects.toThrow("M2_RESET_REQUIRES_ISOLATED_DATABASE");
    expect(connect).not.toHaveBeenCalled();
  });

  it("rejects raw URL values that differ only by surrounding whitespace", async () => {
    const connect = vi.fn();
    await expect(resetM2AuthenticatedFixtures({DATABASE_URL_TEST: "isolated ", DATABASE_URL: "isolated"}, {connect, seed: vi.fn()}))
      .rejects.toThrow("M2_RESET_REQUIRES_ISOLATED_DATABASE");
    expect(connect).not.toHaveBeenCalled();
  });

  it("rejects a Neon reset without an independently allowlisted test project", async () => {
    const connect = vi.fn();
    const databaseUrl = "postgresql://test@ep-preview.ap-southeast-1.aws.neon.tech/neondb";
    await expect(resetM2AuthenticatedFixtures(
      {DATABASE_URL_TEST: databaseUrl, DATABASE_URL: databaseUrl, NEON_PROJECT_ID: "solitary-wave-preview"},
      {connect, seed: vi.fn()},
    )).rejects.toThrow("M2_RESET_REQUIRES_ISOLATED_NEON_PROJECT");
    expect(connect).not.toHaveBeenCalled();
  });

  it("rejects a production Neon project when the acceptance allowlist names the isolated Preview project", async () => {
    const connect = vi.fn();
    const databaseUrl = "postgresql://prod@ep-production.ap-southeast-1.aws.neon.tech/neondb";
    await expect(resetM2AuthenticatedFixtures(
      {
        DATABASE_URL_TEST: databaseUrl,
        DATABASE_URL: databaseUrl,
        NEON_PROJECT_ID: "br-noisy-glitter-ao2npd77",
        M2_TEST_NEON_PROJECT_ID: "solitary-wave-52860119",
      },
      {connect, seed: vi.fn()},
    )).rejects.toThrow("M2_RESET_REQUIRES_ISOLATED_NEON_PROJECT");
    expect(connect).not.toHaveBeenCalled();
  });

  it("rejects a production Neon URL even when both project IDs name the isolated Preview project", async () => {
    const connect = vi.fn();
    const databaseUrl = "postgresql://prod@ep-production.ap-southeast-1.aws.neon.tech/neondb";
    await expect(resetM2AuthenticatedFixtures(
      {
        DATABASE_URL_TEST: databaseUrl,
        DATABASE_URL: databaseUrl,
        NEON_PROJECT_ID: "solitary-wave-52860119",
        M2_TEST_NEON_PROJECT_ID: "solitary-wave-52860119",
        M2_TEST_NEON_HOST: "ep-preview.ap-southeast-1.aws.neon.tech",
      },
      {connect, seed: vi.fn()},
    )).rejects.toThrow("M2_RESET_REQUIRES_ISOLATED_NEON_ENDPOINT");
    expect(connect).not.toHaveBeenCalled();
  });

  it("allows a Neon reset only when the URL host and project match both independent allowlists", async () => {
    const databaseUrl = "postgresql://test@ep-preview.ap-southeast-1.aws.neon.tech/neondb";
    const connection = {query: vi.fn(async () => undefined), release: vi.fn()};
    const seed = vi.fn(async () => undefined);
    await expect(resetM2AuthenticatedFixtures(
      {
        DATABASE_URL_TEST: databaseUrl,
        DATABASE_URL: databaseUrl,
        NEON_PROJECT_ID: "solitary-wave-52860119",
        M2_TEST_NEON_PROJECT_ID: "solitary-wave-52860119",
        M2_TEST_NEON_HOST: "ep-preview.ap-southeast-1.aws.neon.tech",
      },
      {connect: async () => connection, seed},
    )).resolves.toBe("reset");
    expect(seed).toHaveBeenCalledTimes(1);
  });

  it("rebases only fixture operational dates when a browser reference instant is explicit", async () => {
    const connection = {query: vi.fn<(sql: string, values?: readonly unknown[]) => Promise<unknown>>(async () => undefined), release: vi.fn()};
    const seed = vi.fn(async () => undefined);
    await resetM2AuthenticatedFixtures(
      {DATABASE_URL_TEST: "isolated", DATABASE_URL: "isolated"},
      {connect: async () => connection, seed},
      new Date("2026-09-27T00:00:00Z"),
    );
    const updates = connection.query.mock.calls.filter(([sql]) => sql.includes("jsonb_to_recordset"));
    expect(updates).toHaveLength(2);
    const profiles = JSON.parse(String(updates[0]![1]![0])) as Array<{id: string; last_login_at: string | null}>;
    const memberships = JSON.parse(String(updates[1]![1]![0])) as Array<{id: string; billing_period_end: string}>;
    expect(profiles).toHaveLength(30);
    expect(profiles.every(row => row.id.startsWith("m2-"))).toBe(true);
    expect(profiles.find(row => row.id === "m2-risk-01")?.last_login_at).toBe("2026-09-26T00:00:00.000Z");
    expect(memberships[0]?.billing_period_end).toBe("2026-10-12T00:00:00.000Z");
    expect(updates.every(([sql]) => sql.includes("WHERE") && sql.includes("fixture.id"))).toBe(true);
    expect(seed).toHaveBeenCalledTimes(1);
  });

  it("deletes only named deterministic mutation state and reruns the M2 seed transactionally", async () => {
    const queries: string[] = [];
    const connection = {query: vi.fn(async (sql: string, values: readonly unknown[] = []) => { queries.push(sql + "\n" + JSON.stringify(values)); }), release: vi.fn()};
    const seed = vi.fn(async () => undefined);
    await expect(resetM2AuthenticatedFixtures({DATABASE_URL_TEST: "isolated", DATABASE_URL: "isolated"}, {connect: async () => connection, seed}))
      .resolves.toBe("reset");

    expect(seed).toHaveBeenCalledTimes(1);
    expect(queries[0]).toMatch(/^BEGIN/);
    expect(queries.at(-1)).toMatch(/^COMMIT/);
    expect(queries.join("\n")).toContain("M2 acceptance follow-up");
    expect(queries.join("\n")).toContain("30000000-0000-4000-8000-000000000001");
    expect(queries.join("\n")).toContain("event.attendee.checked_in");
    expect(queries.join("\n")).toContain("approval.approved");
    expect(queries.join("\n")).not.toContain("isolated");
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});