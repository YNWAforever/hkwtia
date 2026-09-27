import {describe, expect, it} from "vitest";

import {encodeAdminMemberCursor, parseAdminMemberRouteQuery} from "@/lib/admin/member-types";

const scope = parseAdminMemberRouteQuery({q: "acme", limit: "20"});
const cursor = encodeAdminMemberCursor({displayName: "alpha", profileId: "profile-alpha"}, scope);

describe("admin member route query boundary", () => {
  it("parses a valid URL query into the service contract", () => {
    expect(parseAdminMemberRouteQuery({q: " acme ", limit: "20", cursor})).toEqual({...scope, cursor});
    expect(() => parseAdminMemberRouteQuery({q: "other", limit: "20", cursor})).toThrow();
  });

  it.each([[{q: ["acme", "other"]}], [{limit: "51"}], [{cursor: "not-an-opaque-cursor"}]])("rejects malformed member-list URL input before repository access", (query) => {
    expect(() => parseAdminMemberRouteQuery(query)).toThrow();
  });
});
