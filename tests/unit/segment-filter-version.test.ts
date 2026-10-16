import {describe, expect, it} from "vitest";

import {
  SEGMENT_FILTER_VERSION,
  parseSegmentFilter,
  parseSegmentRouteQuery,
  segmentFilterV1Schema,
  segmentFilterV2Schema,
} from "@/lib/admin/segment-schema";

const eventId = "11111111-1111-4111-8111-111111111111";

/** The exact shape every `filter_version = 1` row in `saved_segments` was written with. */
const storedV1 = {
  profileIds: [],
  tier: ["corporate"],
  status: [],
  scoreMin: null,
  scoreMax: null,
  renewalWithinDays: null,
  sector: "",
  lastLoginBeforeDays: null,
  whatsappOptIn: null,
};

const v2Defaults = {
  industryTags: [],
  companyPlan: [],
  event: null,
  audience: "members",
  contactStage: [],
  contactSource: [],
};

describe("saved segment filter version dispatch (C-6, S-9)", () => {
  it("names the current version once, so the writer and the dispatcher cannot drift", () => {
    expect(SEGMENT_FILTER_VERSION).toBe(2);
  });

  it("reads a stored v1 row and fills the six v2 keys with their defaults", () => {
    expect(parseSegmentFilter(1, storedV1)).toEqual({...storedV1, ...v2Defaults});
  });

  it("reads a v2 row with every new key set", () => {
    const storedV2 = {
      ...storedV1,
      industryTags: ["fintech", "ai"],
      companyPlan: ["corporate"],
      event: {eventId, state: "not_registered"},
      audience: "both",
      contactStage: ["new"],
      contactSource: ["whatsapp"],
    };
    expect(parseSegmentFilter(SEGMENT_FILTER_VERSION, storedV2)).toEqual(storedV2);
  });

  it("still throws on an unknown key in a v1 row — `.strict()` is the whole point of freezing v1", () => {
    expect(() => parseSegmentFilter(1, {...storedV1, email: "member@example.test"})).toThrow();
  });

  // S-9 in the tree, not on paper: `parseSegmentRouteQuery` now emits the six v2
  // keys at their defaults, so the hidden `filters` input the save form posts is
  // v2-shaped from this commit onwards. A row tagged 1 that carries them is
  // unreadable, which is why `saveSegment` writes SEGMENT_FILTER_VERSION here and
  // not in Task 7. Deleting this assertion is how that regresses silently.
  it("throws on a v1 row carrying a v2 key, which is why the writer bumps the version", () => {
    expect(() => parseSegmentFilter(1, {...storedV1, audience: "contacts"})).toThrow();
  });

  it("refuses a version it does not know rather than guessing a shape", () => {
    expect(() => parseSegmentFilter(3, storedV1)).toThrow("UNSUPPORTED_SEGMENT_FILTER_VERSION");
    expect(() => parseSegmentFilter(0, storedV1)).toThrow("UNSUPPORTED_SEGMENT_FILTER_VERSION");
  });

  it("rejects a tag outside the closed industry vocabulary", () => {
    expect(() => parseSegmentFilter(2, {...storedV1, industryTags: ["not-a-tag"]})).toThrow();
    expect(parseSegmentFilter(2, {...storedV1, industryTags: ["greentech"]}).industryTags).toEqual(["greentech"]);
  });

  // S-10: `no_show` lives on `registration_status` and not on
  // `guest_registration_status`, so offering it would mean one thing for members
  // and nothing for contacts — a filter that lies.
  it("rejects an event state that would mean different things per audience", () => {
    expect(() => parseSegmentFilter(2, {...storedV1, event: {eventId, state: "no_show"}})).toThrow();
    expect(() => parseSegmentFilter(2, {...storedV1, event: {eventId: "not-a-uuid", state: "registered"}})).toThrow();
  });

  it("keeps the frozen v1 schema and the current v2 schema separately exported", () => {
    expect(segmentFilterV1Schema.safeParse({...storedV1, audience: "members"}).success).toBe(false);
    expect(segmentFilterV2Schema.safeParse({...storedV1, audience: "members"}).success).toBe(true);
  });

  it("carries the composite event filter as two flat URL params", () => {
    expect(parseSegmentRouteQuery({
      eventId,
      eventState: "not_registered",
      audience: "contacts",
      industryTag: ["fintech", "ai"],
      companyPlan: "corporate",
      contactStage: "new",
      contactSource: "whatsapp",
    }).filter).toMatchObject({
      event: {eventId, state: "not_registered"},
      audience: "contacts",
      industryTags: ["fintech", "ai"],
      companyPlan: ["corporate"],
      contactStage: ["new"],
      contactSource: ["whatsapp"],
    });
  });

  // `segmentRouteQuerySchema` is `.strict()`, so a URL key it does not know throws
  // on page render. A blank `<select>` option must therefore mean "any", exactly
  // as the F11 tri-state does for `whatsappOptIn` — not a 500 on /admin/segments.
  it("treats a blank v2 control as 'any' rather than a render-time throw", () => {
    expect(parseSegmentRouteQuery({
      eventId: "",
      eventState: "",
      audience: "",
      industryTag: "",
      companyPlan: "",
      contactStage: "",
      contactSource: "",
    }).filter).toMatchObject(v2Defaults);
  });

  it("defaults a chosen event with no state to `registered` instead of failing the render", () => {
    expect(parseSegmentRouteQuery({eventId, eventState: ""}).filter.event).toEqual({eventId, state: "registered"});
  });
});
