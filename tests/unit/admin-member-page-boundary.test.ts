import {describe, expect, it} from "vitest";

import {parseAdminMemberRouteQuery} from "@/lib/admin/member-types";

const cursor = Buffer.from(JSON.stringify({displayName: "alpha", profileId: "profile-alpha"}), "utf8").toString("base64url");

describe("admin member route query boundary", () => {
  it("parses a valid URL query into the service contract", () => {
    expect(parseAdminMemberRouteQuery({q: " acme ", limit: "20", cursor})).toEqual({search: "acme", limit: 20, cursor});
  });

  it.each([[{q: ["acme", "other"]}], [{limit: "51"}], [{cursor: "not-an-opaque-cursor"}]])("rejects malformed member-list URL input before repository access", (query) => {
    expect(() => parseAdminMemberRouteQuery(query)).toThrow();
  });
});
