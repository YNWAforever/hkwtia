import {PgDialect} from "drizzle-orm/pg-core";
import {beforeEach, describe, expect, it, vi} from "vitest";
const state = vi.hoisted(() => ({execute: vi.fn()}));
vi.mock("@/lib/db/repos/common", () => ({getDb: async () => ({execute: state.execute})}));
import {listOwnRegistrationHistory} from "@/lib/db/repos/portal-registrations";
const actor = {kind: "member", userId: "auth-subject", profileId: "buyer-profile"} as const;
const row = {id: "22222222-2222-4222-8222-222222222222", eventId: "11111111-1111-4111-8111-111111111111", source: "ticket", status: "paid", titleEn: "Event", titleZh: null, startsAt: "2099-01-01T00:00:00.123456Z", eventStatus: "published", visibility: "members_only"};
const dialect = new PgDialect();
beforeEach(() => {vi.clearAllMocks(); state.execute.mockResolvedValue({rows: []});});
describe("compiled history query boundaries", () => {
  it.each([[undefined, 21], [9999, 51], [0, 2], [NaN, 21]])("bounds query for limit %s", async (limit, expected) => {
    await listOwnRegistrationHistory(actor, {limit});
    const query = dialect.sqlToQuery(state.execute.mock.calls[0][0]);
    expect(query.params).toEqual([actor.profileId, actor.profileId, expected]);
    expect(query.sql).toMatch(/WHERE "event_registrations"\."profile_id" = \$1/);
    expect(query.sql).toMatch(/WHERE "event_orders"\."buyer_profile_id" = \$2/);
    expect(query.sql).not.toMatch(/attendee_email|buyer_email|stripe_checkout_url|event_order_seats/);
  });
  it("emits an exact microsecond cursor and uses it with the same order tuple", async () => {
    state.execute.mockResolvedValueOnce({rows: [row, {...row, id: "33333333-3333-4333-8333-333333333333"}]}).mockResolvedValueOnce({rows: []});
    const first = await listOwnRegistrationHistory(actor, {limit: 1});
    expect(first.items).toHaveLength(1);
    await listOwnRegistrationHistory(actor, {cursor: first.nextCursor});
    const query = dialect.sqlToQuery(state.execute.mock.calls[1][0]);
    expect(query.params).toEqual([actor.profileId, actor.profileId, row.startsAt, row.startsAt, row.source, row.source, row.id, 21]);
    expect(query.sql).toContain('ORDER BY starts_at DESC, source COLLATE "C" ASC, id COLLATE "C" ASC');
  });
  it("does not turn bad query results or database failures into an empty success", async () => {
    state.execute.mockResolvedValueOnce({rows: [{...row, status: "invented"}]}).mockRejectedValueOnce(new Error("DB_FAILED"));
    await expect(listOwnRegistrationHistory(actor)).rejects.toThrow();
    await expect(listOwnRegistrationHistory(actor)).rejects.toThrow("DB_FAILED");
  });
});
