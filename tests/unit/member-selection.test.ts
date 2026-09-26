import {describe, expect, it} from "vitest";

import {parseMemberSelection} from "@/lib/admin/member-selection";

describe("member operations selection", () => {
  it("deduplicates an explicit page selection without accepting a client actor", () => {
    expect(parseMemberSelection({mode: "ids", profileIds: ["profile-a", "profile-a", "profile-b"]})).toEqual({mode: "ids", profileIds: ["profile-a", "profile-b"]});
    expect(() => parseMemberSelection({mode: "ids", profileIds: ["profile-a"], actor: "superadmin"})).toThrow();
  });

  it("requires a bounded filter for select-all and keeps exclusions distinct", () => {
    expect(parseMemberSelection({mode: "query", query: {status: ["active"]}, excludedProfileIds: ["profile-a", "profile-a"]})).toMatchObject({mode: "query", query: {status: ["active"]}, excludedProfileIds: ["profile-a"]});
    expect(() => parseMemberSelection({mode: "query", query: {}, excludedProfileIds: []})).toThrow();
    expect(() => parseMemberSelection({mode: "query", query: {status: ["made-up"]}, excludedProfileIds: []})).toThrow();
  });
});
