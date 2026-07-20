import {describe, expect, it} from "vitest";

import {parseSegmentRouteQuery, segmentFilterSchema} from "@/lib/admin/segment-schema";

describe("segment filter schema", () => {
  it("parses bounded filter values and defaults omitted fields", () => {
    expect(segmentFilterSchema.parse({tier: ["corporate"], scoreMin: "10"})).toEqual({
      profileIds: [],
      tier: ["corporate"],
      status: [],
      scoreMin: 10,
      scoreMax: null,
      renewalWithinDays: null,
      sector: "",
      lastLoginBeforeDays: null,
    });
  });

  it("parses repeated exact profile identity without accepting PII selectors", () => {
    expect(parseSegmentRouteQuery({profileId: ["profile-a", "profile-b"], status: "past_due", scoreMax: "19", renewalWithinDays: "60"}).filter).toMatchObject({
      profileIds: ["profile-a", "profile-b"],
      status: ["past_due"],
      scoreMax: 19,
      renewalWithinDays: 60,
    });
    expect(() => segmentFilterSchema.parse({profileIds: ["profile-a"], email: "member@example.test"})).toThrow();
  });
  it("rejects unknown filter keys and an inverted score range", () => {
    expect(() => segmentFilterSchema.parse({tier: ["corporate"], unexpected: "value"})).toThrow();
    expect(() => segmentFilterSchema.parse({scoreMin: 50, scoreMax: 20})).toThrow();
  });

  it("parses URL filters without treating pagination keys as filter keys", () => {
    expect(parseSegmentRouteQuery({tier: "corporate", scoreMax: "19.99", renewalWithinDays: "60", limit: "25", cursor: null})).toEqual({
      filter: {profileIds: [], tier: ["corporate"], status: [], scoreMin: null, scoreMax: 19.99, renewalWithinDays: 60, sector: "", lastLoginBeforeDays: null},
      limit: 25,
      cursor: null,
    });
  });

  it.each(["", "   ", "\t"])("normalizes blank numeric filter input %j to null", (blank) => {
    expect(segmentFilterSchema.parse({scoreMin: blank, scoreMax: blank, renewalWithinDays: blank, lastLoginBeforeDays: blank})).toMatchObject({scoreMin: null, scoreMax: null, renewalWithinDays: null, lastLoginBeforeDays: null});
  });

  it("keeps valid numeric strings bounded and rejects nonnumeric numeric filter input", () => {
    expect(segmentFilterSchema.parse({scoreMin: "1.5", scoreMax: "20", renewalWithinDays: "60", lastLoginBeforeDays: "90"})).toMatchObject({scoreMin: 1.5, scoreMax: 20, renewalWithinDays: 60, lastLoginBeforeDays: 90});
    expect(() => segmentFilterSchema.parse({scoreMin: "not-a-number"})).toThrow();
  });

  it("keeps all blank URL numeric controls absent from the preview filter", () => {
    expect(parseSegmentRouteQuery({scoreMin: " ", scoreMax: "", renewalWithinDays: "\t", lastLoginBeforeDays: "   "}).filter).toMatchObject({scoreMin: null, scoreMax: null, renewalWithinDays: null, lastLoginBeforeDays: null});
  });
});
