import {describe, expect, it} from "vitest";

import {parseSegmentRouteQuery, segmentFilterSchema} from "@/lib/admin/segment-schema";

describe("segment filter schema", () => {
  it("parses bounded filter values and defaults omitted fields", () => {
    expect(segmentFilterSchema.parse({tier: ["corporate"], scoreMin: "10"})).toEqual({
      tier: ["corporate"],
      status: [],
      scoreMin: 10,
      scoreMax: null,
      renewalWithinDays: null,
      sector: "",
      lastLoginBeforeDays: null,
    });
  });

  it("rejects unknown filter keys and an inverted score range", () => {
    expect(() => segmentFilterSchema.parse({tier: ["corporate"], unexpected: "value"})).toThrow();
    expect(() => segmentFilterSchema.parse({scoreMin: 50, scoreMax: 20})).toThrow();
  });

  it("parses URL filters without treating pagination keys as filter keys", () => {
    expect(parseSegmentRouteQuery({tier: "corporate", scoreMax: "19.99", renewalWithinDays: "60", limit: "25", cursor: null})).toEqual({
      filter: {tier: ["corporate"], status: [], scoreMin: null, scoreMax: 19.99, renewalWithinDays: 60, sector: "", lastLoginBeforeDays: null},
      limit: 25,
      cursor: null,
    });
  });
});
