import {describe, expect, it} from "vitest";

import {parseDonorPartnerFile, parseZhNameSidecar, resolveZhName} from "@/scripts/lib/partner-import-input";

describe("parseDonorPartnerFile", () => {
  it("accepts a well-formed donor partner array", () => {
    const parsed = parseDonorPartnerFile([
      {name: "Harbour Trade Council", category: "supporting", logoFile: "harbour-trade.png"},
      {name: "GBA Media Group", category: "media", website: "https://example.org", logoFile: "gba-media.png"},
    ]);
    expect(parsed).toHaveLength(2);
    expect(parsed[1]!.website).toBe("https://example.org");
  });

  it("rejects an unknown category rather than silently coercing it", () => {
    expect(() => parseDonorPartnerFile([{name: "X", category: "sponsor-tier", logoFile: "x.png"}]))
      .toThrow();
  });

  it("rejects a record with no logo file reference", () => {
    expect(() => parseDonorPartnerFile([{name: "X", category: "supporting"}])).toThrow();
  });
});

describe("parseZhNameSidecar", () => {
  it("parses a two-column name_en,name_zh_hk CSV", () => {
    const map = parseZhNameSidecar("name_en,name_zh_hk\nHarbour Trade Council,港口貿易協會\n");
    expect(map.get("Harbour Trade Council")).toBe("港口貿易協會");
  });

  it("rejects a CSV missing the required header", () => {
    expect(() => parseZhNameSidecar("en,zh\nHarbour,港口\n")).toThrow("PARTNER_IMPORT_ZH_CSV_INVALID");
  });

  it("rejects a row with a blank name_en", () => {
    expect(() => parseZhNameSidecar("name_en,name_zh_hk\n,港口貿易協會\n")).toThrow("PARTNER_IMPORT_ZH_CSV_INVALID");
  });
});

describe("resolveZhName", () => {
  it("uses the sidecar's Chinese name when present", () => {
    const sidecar = new Map([["Harbour Trade Council", "港口貿易協會"]]);
    expect(resolveZhName("Harbour Trade Council", sidecar)).toBe("港口貿易協會");
  });

  it("falls back to the English name when the sidecar has no entry", () => {
    expect(resolveZhName("GBA Media Group", new Map())).toBe("GBA Media Group");
  });
});
