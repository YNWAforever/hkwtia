import {describe, expect, it, vi} from "vitest";
import {createOwnedApplicationReader, type OwnedApplicationPort, type OwnedApplicationRow} from "@/lib/membership/owned-application-reader";
const a = {kind: "member", userId: "auth-a", profileId: "a"} as const;
const b = {...a, profileId: "b"};
const ids = [1, 2, 3].map(n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
function setup() {
  const rows = ids.map(id => ({id, applicantUserId: "a", planCode: "community" as const, companyId: null, currentStep: "profile" as const, status: "draft" as const, inviteId: null, utmSource: null, utmMedium: null, utmCampaign: null, utmTerm: null, utmContent: null, referralCode: null, referrerHost: null, landingPath: null, heardAbout: null, attributionCapturedAt: null, createdAt: new Date("2026-10-26T00:00:00Z"), updatedAt: new Date("2026-10-26T00:00:00Z"), cursorTime: "2026-10-26T00:00:00.000123Z"} satisfies OwnedApplicationRow));
  const select = vi.fn<OwnedApplicationPort["select"]>(async query => rows.filter(r => r.applicantUserId === query.ownerId && (!query.after || r.cursorTime < query.after.time || (r.cursorTime === query.after.time && r.id < query.after.id))).sort((x, y) => y.id.localeCompare(x.id)).slice(0, query.take));
  const find = vi.fn<OwnedApplicationPort["find"]>(async query => rows.find(r => r.id === query.id && r.applicantUserId === query.ownerId) ?? null);
  return {reader: createOwnedApplicationReader({select, find}), select, find};
}
describe("owned application paging port", () => {
  it("takes limit+1 and pages a same-timestamp fixture with no missing or duplicate rows", async () => {
    const s = setup();
    const first = await s.reader.listOwnedPage(a, {limit: 2});
    expect(s.select).toHaveBeenCalledWith({ownerId: "a", take: 3, after: null});
    expect(first.items.map(r => r.id)).toEqual([ids[2], ids[1]]);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(first.items[0]).not.toHaveProperty("cursorTime");
    const second = await s.reader.listOwnedPage(a, {limit: 2, cursor: first.nextCursor!});
    expect(second.items.map(r => r.id)).toEqual([ids[0]]); expect(second.nextCursor).toBeNull();
    expect(s.select.mock.calls[1][0].after?.time).toBe("2026-10-26T00:00:00.000123Z");
  });
  it("defaults to 20, caps at 50 and refuses invalid limits before reads", async () => {
    const s = setup(); await s.reader.listOwnedPage(a, {});
    expect(s.select.mock.calls[0][0].take).toBe(21);
    await s.reader.listOwnedPage(a, {limit: 500}); expect(s.select.mock.calls[1][0].take).toBe(51);
    for (const limit of [0, -1, 1.5]) await expect(s.reader.listOwnedPage(a, {limit})).rejects.toThrow("INVALID_APPLICATION_PAGE");
    expect(s.select).toHaveBeenCalledTimes(2);
  });
  it("binds cursors to actor and query scope and rejects malformed IDs/timestamps before reads", async () => {
    const s = setup(); const page = await s.reader.listOwnedPage(a, {limit: 1});
    await expect(s.reader.listOwnedPage(b, {cursor: page.nextCursor!})).rejects.toThrow("INVALID_APPLICATION_PAGE");
    const decoded = JSON.parse(Buffer.from(page.nextCursor!, "base64url").toString());
    for (const patch of [{scope: "other-query"}, {id: "bad-id"}, {time: "not-a-date"}, {v: 2}]) {
      const cursor = Buffer.from(JSON.stringify({...decoded, ...patch})).toString("base64url");
      await expect(s.reader.listOwnedPage(a, {cursor})).rejects.toThrow("INVALID_APPLICATION_PAGE");
    }
    for (const cursor of ["?", "x".repeat(3000)]) await expect(s.reader.listOwnedPage(a, {cursor})).rejects.toThrow("INVALID_APPLICATION_PAGE");
    expect(s.select).toHaveBeenCalledTimes(1);
  });
  it("reads a detail by owned ID, rejects invalid UUID before I/O and preserves typed failure", async () => {
    const s = setup(); expect(await s.reader.getOwnedById(a, ids[0])).toMatchObject({id: ids[0]});
    expect(s.find).toHaveBeenCalledWith({ownerId: "a", id: ids[0]});
    expect(await s.reader.getOwnedById(b, ids[0])).toBeNull();
    expect(await s.reader.getOwnedById(a, "invalid")).toBeNull(); expect(s.find).toHaveBeenCalledTimes(2);
    s.find.mockRejectedValueOnce(Error("private backend detail"));
    await expect(s.reader.getOwnedById(a, ids[0])).rejects.toMatchObject({name: "OwnedApplicationReadError", code: "APPLICATION_READ_FAILED", message: "APPLICATION_READ_FAILED"});
    s.select.mockRejectedValueOnce(Error("private detail"));
    await expect(s.reader.listOwnedPage(a, {})).rejects.toMatchObject({code: "APPLICATION_READ_FAILED"});
  });
  it("rejects staff/anonymous actors without any repository read", async () => {
    const s = setup();
    for (const actor of [{kind: "anonymous", userId: null}, {...a, kind: "staff"}] as const) {
      await expect(s.reader.listOwnedPage(actor, {})).rejects.toThrow("FORBIDDEN");
      await expect(s.reader.getOwnedById(actor, ids[0])).rejects.toThrow("FORBIDDEN");
    }
    expect(s.select).not.toHaveBeenCalled(); expect(s.find).not.toHaveBeenCalled();
  });
});
