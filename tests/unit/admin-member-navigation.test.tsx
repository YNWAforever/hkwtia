import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {MemberTable} from "@/components/admin/member-table";
import {adminMemberListHref, encodeAdminMemberCursor, parseAdminMemberHistory, parseAdminMemberRouteQuery} from "@/lib/admin/member-types";
import en from "@/messages/en.json";

const member = {profileId: "member-a", membershipId: "membership-a", companyId: "company-a", displayName: "Ada Wong", email: "ada@example.test", companyName: "Acme", planCode: "startup", membershipStatus: "active", renewalAt: "2026-12-31T20:00:00.000Z", score: 18};

describe("admin member navigation", () => {
  it("opens Member 360 from the name and a view link while preserving only local list filters", () => {
    const markup = renderToStaticMarkup(<MemberTable locale="en" labels={en.Admin.members} page={{items: [member], nextCursor: null}} query="acme"/>);
    expect(markup).toContain('/admin/members/member-a?q=acme');
    expect(markup).toContain('>Ada Wong</a>');
    expect(markup).toContain('>View</a>');
    expect(markup).toContain('Jan 1, 2027');
    expect(markup).not.toContain('>startup<');
  });

  it("renders keyboard-usable previous and next links while preserving a validated search trail", () => {
    const cursor = encodeAdminMemberCursor({displayName: "Ada Wong", profileId: "member-a"});
    const first = renderToStaticMarkup(<MemberTable locale="en" labels={en.Admin.members} page={{items: [member], nextCursor: cursor}} query="acme"/>);
    expect(first).toContain('>Next page</a>');
    expect(first).toContain('history=');
    const second = renderToStaticMarkup(<MemberTable locale="en" labels={en.Admin.members} page={{items: [], nextCursor: null}} query="acme" cursor={cursor} history={[null]}/>);
    expect(second).toContain('href="/admin/members?q=acme"');
    expect(second).toContain('>Previous page</a>');
  });

  it("rejects an external return hint and constructs only a local list URL", () => {
    const state = parseAdminMemberRouteQuery({q: "acme", return: "https://evil.example.test/steal"});
    expect(adminMemberListHref("/zh", state)).toBe("/zh/admin/members?q=acme");
    const hostile = Buffer.from(JSON.stringify(["https://evil.example.test"]), "utf8").toString("base64url");
    expect(() => parseAdminMemberHistory(hostile)).toThrow("INVALID_HISTORY");
  });
});
