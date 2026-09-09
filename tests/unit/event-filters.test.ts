import {describe, expect, it} from "vitest";

import {eventFilterQuery, hongKongMonthBounds, normaliseEventTag, organiserSlugFromDisplayName, parseEventFilters} from "@/lib/events/filters";

describe("event filters (programme B-6)", () => {
  it("parses format, month, organiser and tag and ignores junk", () => {
    expect(parseEventFilters({format: "online", month: "2026-10", organiser: "acme", tag: "AI"})).toEqual({format: "online", month: "2026-10", organiser: "acme", tag: "ai"});
    expect(parseEventFilters({format: "tv", month: "2026-13", organiser: "../", tag: "a".repeat(80)})).toEqual({format: null, month: null, organiser: null, tag: null});
    expect(parseEventFilters({})).toEqual({format: null, month: null, organiser: null, tag: null});
  });

  it("takes the first value of a repeated key and rejects an over-long organiser", () => {
    expect(parseEventFilters({format: ["hybrid", "online"], tag: ["fintech"]})).toMatchObject({format: "hybrid", tag: "fintech"});
    expect(parseEventFilters({organiser: "a".repeat(97)}).organiser).toBeNull();
    expect(parseEventFilters({organiser: "Acme-Robotics"}).organiser).toBe("acme-robotics");
  });

  it("derives the organiser slug from a typed display name the way the SQL predicate does", () => {
    expect(parseEventFilters({organiser: "Acme Robotics"}).organiser).toBe("acme-robotics");
    expect(parseEventFilters({organiser: " Acme Ltd. "}).organiser).toBe("acme-ltd");
    expect(organiserSlugFromDisplayName("Acme Ltd.")).toBe("acme-ltd");
    expect(organiserSlugFromDisplayName("--A&B (HK)--")).toBe("a-b-hk");
    expect(organiserSlugFromDisplayName("!!!")).toBe("");
  });

  it("normalises a tag to the slug spelling stored on every write", () => {
    expect(normaliseEventTag(" Machine Learning ")).toBe("machine-learning");
    expect(normaliseEventTag("AI")).toBe("ai");
    expect(normaliseEventTag("Web3/DeFi")).toBe("web3-defi");
    expect(normaliseEventTag("-ai-")).toBe("ai");
    expect(normaliseEventTag("")).toBeNull();
    expect(normaliseEventTag("   ")).toBeNull();
    expect(normaliseEventTag("###")).toBeNull();
    expect(normaliseEventTag("a".repeat(40))).toBe("a".repeat(40));
    expect(normaliseEventTag("a".repeat(41))).toBeNull();
    expect(parseEventFilters({tag: "Machine Learning"}).tag).toBe("machine-learning");
  });

  it("round-trips to a query string without empty keys", () => {
    expect(eventFilterQuery({format: "hybrid", month: null, organiser: null, tag: "ai"}, "past")).toBe("status=past&format=hybrid&tag=ai");
    expect(eventFilterQuery({format: null, month: null, organiser: null, tag: null}, "open")).toBe("status=open");
  });

  it("bounds a month in Asia/Hong_Kong", () => {
    expect(hongKongMonthBounds("2026-10")).toEqual({start: new Date("2026-09-30T16:00:00.000Z"), end: new Date("2026-10-31T16:00:00.000Z")});
    expect(hongKongMonthBounds("2026-12")).toEqual({start: new Date("2026-11-30T16:00:00.000Z"), end: new Date("2026-12-31T16:00:00.000Z")});
  });
});
