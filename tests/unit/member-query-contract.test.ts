import { describe, expect, it } from "vitest";

import {
  adminMemberListHref,
  adminMemberQuerySchema,
  encodeAdminMemberCursor,
  parseAdminMemberRouteQuery,
} from "@/lib/admin/member-types";
import { hongKongDayStartUtc } from "@/lib/admin/member-query";

const companyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("member operations query contract", () => {
  it("preserves explicit20-row pages when the default is50", () => {
    const base = adminMemberQuerySchema.parse({});
    const href = adminMemberListHref("/zh", { ...base, limit: 20 });
    const params = Object.fromEntries(
      new URL(href, "https://example.test").searchParams,
    );
    expect(parseAdminMemberRouteQuery(params).limit).toBe(20);
    expect(
      new URL(
        adminMemberListHref("/zh", { ...base, limit: 50 }),
        "https://example.test",
      ).searchParams.has("limit"),
    ).toBe(false);
  });
  it("normalizes strict multi-value filters and preserves a Hong Kong date window", () => {
    expect(
      parseAdminMemberRouteQuery({
        q: " Acme ",
        status: ["active", "past_due"],
        planCode: "corporate",
        renewalFrom: "2026-10-01",
        renewalTo: "2026-10-31",
        companyId,
        locale: "zh-HK",
        completeness: "incomplete",
        sort: "renewal_asc",
      }),
    ).toMatchObject({
      search: "Acme",
      status: ["active", "past_due"],
      planCode: ["corporate"],
      renewalFrom: "2026-10-01",
      renewalTo: "2026-10-31",
      companyId,
      locale: "zh-HK",
      completeness: "incomplete",
      sort: "renewal_asc",
      limit: 50,
      cursor: null,
    });
  });

  it("binds a cursor to its sort and filters and uses Hong Kong midnight", () => {
    const active = adminMemberQuerySchema.parse({ status: ["active"] });
    const cursor = encodeAdminMemberCursor(
      { displayName: "Ada", profileId: "profile-a" },
      active,
    );
    expect(adminMemberQuerySchema.parse({ ...active, cursor }).cursor).toBe(
      cursor,
    );
    expect(() =>
      adminMemberQuerySchema.parse({ ...active, status: ["past_due"], cursor }),
    ).toThrow();
    expect(hongKongDayStartUtc("2026-10-01").toISOString()).toBe(
      "2026-09-30T16:00:00.000Z",
    );
    expect(hongKongDayStartUtc("2026-10-31", true).toISOString()).toBe(
      "2026-10-31T16:00:00.000Z",
    );
  });

  it("rejects unknown filters, contradictory dates and invalid statuses instead of widening audience", () => {
    expect(() =>
      parseAdminMemberRouteQuery({ status: "not-a-status" }),
    ).toThrow();
    expect(() =>
      parseAdminMemberRouteQuery({ status: "active", futureFlag: "true" }),
    ).toThrow();
    expect(() =>
      parseAdminMemberRouteQuery({
        renewalFrom: "2026-11-01",
        renewalTo: "2026-10-31",
      }),
    ).toThrow();
    expect(() =>
      adminMemberQuerySchema.parse({
        status: ["active"],
        planCode: ["not-a-plan"],
      }),
    ).toThrow();
  });
});
