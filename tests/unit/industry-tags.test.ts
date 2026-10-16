import {describe, expect, it} from "vitest";

import {INDUSTRY_TAGS, industryTagLabel, isIndustryTag} from "@/config/industry-tags";

describe("industry tags (S-4)", () => {
  it("is a stable slug list with bilingual labels", () => {
    expect(INDUSTRY_TAGS.length).toBeGreaterThanOrEqual(20);
    for (const tag of INDUSTRY_TAGS) {
      expect(tag.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(tag.en.length).toBeGreaterThan(0);
      expect(tag.zhHk.length).toBeGreaterThan(0);
    }
    expect(isIndustryTag("ai")).toBe(true);
    expect(isIndustryTag("crypto-scams")).toBe(false);
  });

  it("has no duplicate slugs, so a checkbox list cannot render the same tag twice", () => {
    const slugs = INDUSTRY_TAGS.map((tag) => tag.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("labels a known slug per locale and falls back to the slug for an unknown one", () => {
    expect(industryTagLabel("ai", "en")).toBe("Artificial intelligence");
    expect(industryTagLabel("ai", "zh-HK")).toBe("人工智能");
    expect(industryTagLabel("crypto-scams", "en")).toBe("crypto-scams");
  });
});
