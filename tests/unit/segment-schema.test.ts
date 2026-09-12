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
      whatsappOptIn: null,
      // C-6: the v2 keys are spelled out rather than relaxed to `toMatchObject`,
      // because this fixture is the contract for what a saved segment stores.
      industryTags: [],
      companyPlan: [],
      event: null,
      audience: "members",
      contactStage: [],
      contactSource: [],
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
      filter: {profileIds: [], tier: ["corporate"], status: [], scoreMin: null, scoreMax: 19.99, renewalWithinDays: 60, sector: "", lastLoginBeforeDays: null, whatsappOptIn: null, industryTags: [], companyPlan: [], event: null, audience: "members", contactStage: [], contactSource: []},
      limit: 25,
      cursor: null,
    });
  });

  it.each(["", "   ", "\t"])("normalizes blank numeric filter input %j to null", (blank) => {
    expect(segmentFilterSchema.parse({scoreMin: blank, scoreMax: blank, renewalWithinDays: blank, lastLoginBeforeDays: blank})).toMatchObject({scoreMin: null, scoreMax: null, renewalWithinDays: null, lastLoginBeforeDays: null, whatsappOptIn: null});
  });

  it("keeps valid numeric strings bounded and rejects nonnumeric numeric filter input", () => {
    expect(segmentFilterSchema.parse({scoreMin: "1.5", scoreMax: "20", renewalWithinDays: "60", lastLoginBeforeDays: "90"})).toMatchObject({scoreMin: 1.5, scoreMax: 20, renewalWithinDays: 60, lastLoginBeforeDays: 90});
    expect(() => segmentFilterSchema.parse({scoreMin: "not-a-number"})).toThrow();
  });

  it("keeps all blank URL numeric controls absent from the preview filter", () => {
    expect(parseSegmentRouteQuery({scoreMin: " ", scoreMax: "", renewalWithinDays: "\t", lastLoginBeforeDays: "   "}).filter).toMatchObject({scoreMin: null, scoreMax: null, renewalWithinDays: null, lastLoginBeforeDays: null, whatsappOptIn: null});
  });
});

describe("segment filter v1.5 whatsappOptIn (Phase A, F11)", () => {
  it("accepts a nullable whatsappOptIn tri-state and defaults it to null", () => {
    expect(segmentFilterSchema.parse({}).whatsappOptIn).toBeNull();
    expect(segmentFilterSchema.parse({whatsappOptIn: true}).whatsappOptIn).toBe(true);
    expect(segmentFilterSchema.parse({whatsappOptIn: "true"}).whatsappOptIn).toBe(true);
    expect(segmentFilterSchema.parse({whatsappOptIn: ""}).whatsappOptIn).toBeNull();
    expect(parseSegmentRouteQuery({whatsappOptIn: "false"}).filter.whatsappOptIn).toBe(false);
    expect(segmentFilterSchema.safeParse({whatsappOptIn: "maybe"}).success).toBe(false);
  });
});
