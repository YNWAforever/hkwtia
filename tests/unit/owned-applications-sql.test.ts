import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it, vi} from "vitest";
import type {Database} from "@/lib/db/repos/common";
import {createOwnedApplicationsRepository} from "@/lib/db/repos/owned-applications";
const actor = {kind: "member", userId: "auth-a", profileId: "profile-a"} as const;
const id = "00000000-0000-4000-8000-000000000001";
describe("owned application SQL adapter (rendered SQL only)", () => {
  it("applies owner, limit+1 and stable keyset predicates in SQL", async () => {
    const run = vi.fn(async () => ({rows: []}));
    const db = drizzle(run) as unknown as Database;
    const repo = createOwnedApplicationsRepository(async () => db);
    const time = "2026-10-26T00:00:00.000123Z";
    const cursor = Buffer.from(JSON.stringify({v: 1, scope: "owned-applications", ownerId: actor.profileId, time, id})).toString("base64url");
    await repo.listOwnedPage(actor, {cursor, limit: 2});
    expect(run).toHaveBeenCalledTimes(1);
    const [sql, params] = run.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('"applicant_user_id" = $1');
    expect(sql).toMatch(/order by .*"updated_at" desc nulls last, .*"id" desc nulls last limit/i);
    expect(sql).toMatch(/\("membership_applications"\."updated_at", "membership_applications"\."id"\) < \(.*::timestamptz, .*::uuid\)/i);
    expect(sql).toContain("US");
    expect(params).toEqual([actor.profileId, time, id, 3]);
    expect(sql).not.toContain("company_members");
  });
  it("reads detail with ID and applicant in one SQL query", async () => {
    const run = vi.fn(async () => ({rows: []}));
    const repo = createOwnedApplicationsRepository(async () => drizzle(run) as unknown as Database);
    expect(await repo.getOwnedById(actor, id)).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
    const [sql, params] = run.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/where .*"id" = .*and .*"applicant_user_id" = /i);
    expect(params).toEqual([id, actor.profileId, 1]);
    expect(sql).not.toContain("company_members");
  });
});
