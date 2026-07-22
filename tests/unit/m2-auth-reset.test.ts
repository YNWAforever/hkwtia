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