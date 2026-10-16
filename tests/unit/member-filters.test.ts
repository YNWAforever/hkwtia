import {describe, expect, it} from "vitest";

import {localeText, memberFilterQuery, parseMemberFilters} from "@/lib/members/public";

describe("member directory filters (S-3)", () => {
  it("keeps a usable search, a vocabulary tag and a real plan", () => {
    expect(parseMemberFilters({q: "  harbour  ", tag: "ai", plan: "patron"}))
      .toEqual({q: "harbour", tag: "ai", plan: "patron"});
  });

  it("drops free text tags and unknown plans rather than passing them to SQL (S-4)", () => {
    expect(parseMemberFilters({tag: "Artificial Intelligence", plan: "enterprise"}))
      .toEqual({q: null, tag: null, plan: null});
  });

  it("drops an empty or over-long query so the directory renders unfiltered", () => {
    expect(parseMemberFilters({q: "   "}).q).toBeNull();
    expect(parseMemberFilters({q: "x".repeat(121)}).q).toBeNull();
    expect(parseMemberFilters({q: "x".repeat(120)}).q).toHaveLength(120);
  });

  it("reads the first value of a repeated parameter, as the other directories do", () => {
    expect(parseMemberFilters({tag: ["ai", "iot"], q: ["one", "two"]}))
      .toEqual({q: "one", tag: "ai", plan: null});
  });

  it("round-trips the parsed filters back into a query string", () => {
    const filters = parseMemberFilters({q: "harbour vision", tag: "ai", plan: "corporate"});

    expect(memberFilterQuery(filters).toString()).toBe("q=harbour+vision&tag=ai&plan=corporate");
    expect(parseMemberFilters(Object.fromEntries(memberFilterQuery(filters)))).toEqual(filters);
  });

  it("emits nothing for an unfiltered directory", () => {
    expect(memberFilterQuery(parseMemberFilters({})).toString()).toBe("");
  });
});

describe("member copy by locale", () => {
  it("prefers the reader's language and falls back to the one the member filled in", () => {
    expect(localeText({en: "Trade intelligence", zhHk: "貿易智能"}, "zh-HK")).toBe("貿易智能");
    expect(localeText({en: "Trade intelligence", zhHk: null}, "zh-HK")).toBe("Trade intelligence");
    expect(localeText({en: null, zhHk: "貿易智能"}, "en")).toBe("貿易智能");
  });

  it("treats a cleared field as absent", () => {
    expect(localeText({en: "   ", zhHk: null}, "en")).toBeNull();
    expect(localeText({en: null, zhHk: null}, "en")).toBeNull();
  });
});
