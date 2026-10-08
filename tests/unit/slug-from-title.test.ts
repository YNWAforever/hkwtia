import {describe, expect, it} from "vitest";

import {slugFromTitle} from "@/lib/events/slug-from-title";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe("slugFromTitle", () => {
  it("lowercases and joins words with single hyphens", () => {
    expect(slugFromTitle("AI in Logistics: Roundtable 2026")).toBe("ai-in-logistics-roundtable-2026");
  });

  it("strips diacritics rather than dropping the letter", () => {
    expect(slugFromTitle("Café Día")).toBe("cafe-dia");
  });

  // Review Focus 1: a title with no ASCII letters or digits leaves the address for the member to fill.
  it("returns an empty string for a title with no ASCII letters or digits", () => {
    expect(slugFromTitle("人工智能論壇")).toBe("");
    expect(slugFromTitle("  --  ")).toBe("");
    expect(slugFromTitle("")).toBe("");
  });

  it("keeps the ASCII part of a mixed title", () => {
    expect(slugFromTitle("WTIA 人工智能論壇 2026")).toBe("wtia-2026");
  });

  it("caps a long title at 80 characters on a hyphen boundary", () => {
    const title = Array.from({length: 20}, (_, index) => `word${index}`).join(" ") + " " + "x".repeat(10);
    expect(title.length).toBeGreaterThanOrEqual(120);
    const slug = slugFromTitle(title);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug).toMatch(SLUG);
    expect(title.toLowerCase().replace(/ /g, "-").startsWith(`${slug}-`)).toBe(true);
  });

  it("hard-cuts a single word longer than the cap", () => {
    expect(slugFromTitle("a".repeat(120))).toBe("a".repeat(80));
  });

  it("always yields a value the slug pattern accepts, or nothing", () => {
    for (const title of ["--Hello--World--", "Ünïcödé ✨ Day!", "１２３ ＡＢＣ", "日本語 only"]) {
      const slug = slugFromTitle(title);
      expect(slug === "" || SLUG.test(slug)).toBe(true);
    }
    expect(slugFromTitle("１２３ ＡＢＣ")).toBe("123-abc");
  });
});
