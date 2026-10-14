import {PgDialect} from "drizzle-orm/pg-core";
import {beforeEach, describe, expect, it, vi} from "vitest";
const state = vi.hoisted(() => ({execute: vi.fn()}));
vi.mock("@/lib/db/repos/common", () => ({getDb: async () => ({execute: state.execute})}));
import {listDirectoryPage, listMemberEventPage} from "@/lib/db/repos/portal-paging";
const actor = {kind: "member", userId: "auth-subject", profileId: "profile"} as const;
const directoryRow = {userId: "profile-one", displayName: "Élodie", sortName: "élodie", jobTitle: null, companyId: null, companyDisplayName: null, industry: null, sizeBand: null};
const eventRow = {id: "11111111-1111-4111-8111-111111111111", slug: "member-event", titleEn: "Event", titleZh: null, descriptionEn: "", descriptionZh: null,
  startsAt: "2099-01-01T00:00:00.123456Z", endsAt: null, venue: null, capacity: null, memberOnly: true, published: true, registrationMode: "rsvp", visibility: "members_only", externalRegistrationUrl: null};
const dialect = new PgDialect();
function query(index = -1) {return dialect.sqlToQuery(state.execute.mock.calls.at(index)![0]);}
beforeEach(() => {vi.clearAllMocks(); state.execute.mockResolvedValue({rows: []});});
describe("SQL directory page contract", () => {
  it.each([[undefined, 21], [10000, 51], [0, 2], [NaN, 21]])("bounds returned candidates for requested limit %s", async (limit, bound) => {
    await listDirectoryPage(actor, {search: "  100%_  ", limit});
    expect(query().params.at(-1)).toBe(bound);
    expect(query().params).toContain("100%_");
    expect(query().sql).toMatch(/position\(lower/);
    expect(query().sql).toContain('"profiles"."directory_visible" = TRUE');
    expect(query().sql).toContain('"companies"."directory_visible" = TRUE');
    expect(query().sql).toContain("directory_seat.revoked_at IS NULL");
    expect(query().sql).toContain('"directory_membership"."grant_expires_at" > now()');
    expect(query().params.filter((v) => v === actor.profileId)).toHaveLength(2);
  });
  it("uses the database sort value and same C tuple; omits private fields", async () => {
    state.execute.mockResolvedValueOnce({rows: [{...directoryRow, email: "private@example.test"}, {...directoryRow, userId: "profile-two"}]});
    const first = await listDirectoryPage(actor, {limit: 1});
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).not.toHaveProperty("email");
    expect(first.items[0]).not.toHaveProperty("sortName");
    await listDirectoryPage(actor, {limit: 1}, first.nextCursor);
    expect(query().params).toContain("élodie");
    expect(query().params).toContain("profile-one");
    expect(query().sql).toMatch(/COLLATE "C"\) > \(.*COLLATE "C"/s);
  });
  it.each(["changed-search", "changed-actor", "old-version", "malformed"])("safely resets a %s cursor", async (reason) => {
    state.execute.mockResolvedValueOnce({rows: [directoryRow, {...directoryRow, userId: "profile-two"}]});
    const first = await listDirectoryPage(actor, {search: "abc", limit: 1});
    const cursor = reason === "old-version" ? Buffer.from(JSON.stringify({displayName: "abc", userId: "a", companyId: ""})).toString("base64url") : reason === "malformed" ? "%%%" : first.nextCursor;
    const result = await listDirectoryPage(reason === "changed-actor" ? {...actor, profileId: "other"} : actor, {search: reason === "changed-search" ? "xyz" : "abc"}, cursor);
    expect(result.cursorReset).toBe(true);
    expect(query().params).not.toContain("profile-one");
  });
});
describe("SQL upcoming event page contract", () => {
  it("keeps exact microseconds and ID ties without exposing staff review data", async () => {
    state.execute.mockResolvedValueOnce({rows: [{...eventRow, rejectionReason: "private"}, {...eventRow, id: "22222222-2222-4222-8222-222222222222"}]});
    const first = await listMemberEventPage(actor, {limit: 1});
    expect(first.items[0]).not.toHaveProperty("rejectionReason");
    await listMemberEventPage(actor, {cursor: first.nextCursor, limit: 1});
    expect(query().params).toContain(eventRow.startsAt);
    expect(query().params).toContain(eventRow.id);
    expect(query().sql).toContain('ORDER BY "events"."starts_at", "events"."id"');
    expect(query().sql).toContain('"events"."starts_at" >= now()');
    expect(query().params.at(-1)).toBe(2);
  });
  it("rejects nonmembers before database access and does not disguise database failure", async () => {
    await expect(listMemberEventPage({kind: "anonymous", userId: null})).rejects.toThrow("FORBIDDEN");
    await expect(listDirectoryPage({kind: "staff", userId: "staff", profileId: "staff"})).rejects.toThrow("FORBIDDEN");
    expect(state.execute).not.toHaveBeenCalled();
    state.execute.mockRejectedValue(new Error("DB_FAILED"));
    await expect(listMemberEventPage(actor)).rejects.toThrow("DB_FAILED");
    await expect(listDirectoryPage(actor)).rejects.toThrow("DB_FAILED");
  });
});
