import {PgDialect} from "drizzle-orm/pg-core";
import {drizzle} from "drizzle-orm/pg-proxy";
import {beforeEach, describe, expect, it, vi} from "vitest";
const state = vi.hoisted(() => ({db: null as unknown, queries: [] as {sql: string; params: unknown[]}[]}));
vi.mock("@/lib/db/repos/common", () => ({getDb: async () => state.db}));
import {portalContentRepository} from "@/lib/db/repos/portal-content";
import {listMemberEvents} from "@/lib/db/repos/events";
import {seatServiceDependencies} from "@/lib/db/repos/seats";
const actor = {kind: "member", userId: "auth-user", profileId: "member-profile"} as const;
beforeEach(() => {
  state.queries = [];
  const db = drizzle(async (sql, params) => {state.queries.push({sql, params}); return {rows: []};});
  state.db = Object.assign(db, {execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
    const compiled = new PgDialect().sqlToQuery(query); state.queries.push(compiled); return {rows: []};
  }});
});
describe("production portal reads are bounded at SQL", () => {
  it("bounds the default directory read and scopes the viewer in the query", async () => {
    await portalContentRepository.listDirectory(actor);
    const query = state.queries.at(-1)!;
    expect(query.sql.toLowerCase()).toContain("limit");
    expect(query.params).toContain(21);
    expect(query.params).toContain(actor.profileId);
    expect(query.sql).toContain('COLLATE "C"');
  });
  it("bounds the default upcoming events read after visibility and current viewer scope", async () => {
    await listMemberEvents(actor, undefined, {hasEligibleMembership: async () => true});
    const query = state.queries.at(-1)!;
    expect(query.sql.toLowerCase()).toContain("limit");
    expect(query.params).toContain(21);
    expect(query.params).toContain(actor.profileId);
    expect(query.sql).toMatch(/starts_at.*>=/s);
  });
  it("uses the same deterministic benefit membership order for display, invite and acceptance capacity", async () => {
    await expect(portalContentRepository.getSeatOverview(actor, "company")).rejects.toThrow("FORBIDDEN");
    const deps = await seatServiceDependencies();
    await deps.getCompany(actor, "company");
    await deps.getCompanyById!("company");
    expect(state.queries).toHaveLength(3);
    for (const query of state.queries) {
      expect(query.sql).toMatch(/order by CASE .*status.*WHEN 'active' THEN 0 WHEN 'past_due' THEN 1 ELSE 2 END.*memberships.*id.*limit/s);
    }
  });
});
