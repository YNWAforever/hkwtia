import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));
vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});
import {adminMembersRepository} from "@/lib/db/repos/admin-members";

const staff = {kind: "staff", userId: "staff-1", profileId: "staff-1"} as const;
const expired = {id: "membership-expired", companyId: "company-b", planCode: "corporate", status: "expired", renewalAt: new Date("2035-01-01"), stripeCustomerId: null, stripeSubscriptionId: null};
const active = {id: "membership-active", companyId: "company-a", planCode: "startup", status: "active", renewalAt: new Date("2027-01-01"), stripeCustomerId: null, stripeSubscriptionId: null};

describe("admin member list/detail membership summary", () => {
  it("selects the same active membership as the list even when an expired record ends later, retaining both companies", async () => {
    const queries: string[] = [];
    database.current = drizzle(async (query) => {
      queries.push(query);
      if (/with matching_profiles/i.test(query)) return {rows: [{profileId: "member-a", displayName: "Member A", email: "a@example.test", membershipId: active.id, companyId: active.companyId, companyName: "Company A", planCode: active.planCode, membershipStatus: active.status, renewalAt: active.renewalAt, score: "9"}]};
      if (/from "profiles"/i.test(query)) return {rows: [{id: "member-a", displayName: "Member A", email: "a@example.test", phone: null, role: "member"}]};
      if (/from "member_notes"/i.test(query)) return {rows: [{id: "note-a", authorProfileId: "staff-a", authorName: "Staff A", body: "Follow up", replacesNoteId: null, createdAt: new Date("2026-08-01")}]};
      if (/from "event_orders"/i.test(query)) return {rows: [{id: "order-a", eventId: "event-a", titleEn: "AI Forum", titleZh: "AI 論壇", status: "refunded", amountHkdCents: 25000, paidAt: new Date("2026-08-01"), refundedAt: new Date("2026-08-02"), refundReason: "cancelled", createdAt: new Date("2026-08-01")}]};
      if (/from "event_order_seats"/i.test(query)) return {rows: [{id: "seat-a", orderId: "order-a", attendeeName: "Guest One", checkedInAt: null}]};
      if (/from "memberships"/i.test(query)) return {rows: [expired, active]};
      if (/from "company_members"/i.test(query)) return {rows: [{id: "company-a", name: "Company A", role: "owner"}, {id: "company-b", name: "Company B", role: "admin"}]};
      return {rows: []};
    });
    const list = await adminMembersRepository.search(staff, {search: "", limit: 20, cursor: null});
    const detail = await adminMembersRepository.get360(staff, "member-a");
    expect(list.items[0]).toMatchObject({membershipId: active.id, companyId: "company-a"});
    expect(detail?.membership).toMatchObject({id: active.id, status: "active"});
    expect(detail?.memberships.map((item) => item.id)).toEqual([active.id, expired.id]);
    expect(detail?.companies.map((item) => item.id)).toEqual(["company-a", "company-b"]);
    expect(detail?.notes).toMatchObject([{id: "note-a", authorName: "Staff A", authorProfileId: "staff-a"}]);
    expect(detail?.purchases).toMatchObject([{id: "order-a", status: "refunded", refundReason: "cancelled", seats: [{attendeeName: "Guest One"}]}]);
    expect(queries.join(" ")).toMatch(/buyer_profile_id/);
    expect(queries.join(" ")).not.toMatch(/buyer_email.*member-a/);
    expect(queries.filter((query) => /from "memberships"/i.test(query)).join(" ")).toMatch(/case [\s\S]*status[\s\S]*when 'active' then 0/i);
    expect(queries.find((query) => /with matching_profiles/i.test(query))).toMatch(/"memberships"\."company_id" AS company_id/i);
  });
});
