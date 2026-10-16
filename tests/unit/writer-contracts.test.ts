import {describe, expect, it} from "vitest";

import {WRITER_KINDS, writerBriefSchema, writerOutputSchema} from "@/lib/ai/writers/contracts";

describe("writer contracts", () => {
  it("names the three surfaces", () => {
    expect([...WRITER_KINDS]).toEqual(["profile", "listing", "event"]);
  });

  it.each([
    ["profile", {taglineEn: "a", taglineZhHk: "b", description: "c", descriptionZhHk: "d"}],
    ["listing", {taglineEn: "a", taglineZhHk: "b", descriptionEn: "c", descriptionZhHk: "d"}],
    ["event", {descriptionEn: "a", descriptionZh: "b"}],
  ] as const)("accepts a well-formed %s output", (kind, value) => {
    expect(writerOutputSchema[kind].parse(value)).toEqual(value);
  });

  it("bounds each tagline by its receiving surface, not one shared limit", () => {
    const tagline = (length: number) => "x".repeat(length);
    // The profile tagline field is 160 while the showcase listing's is 240, so
    // a single shared bound would either truncate a valid listing tagline or
    // pass a profile tagline the profile repository then refuses.
    expect(writerOutputSchema.profile.safeParse({
      taglineEn: tagline(160), taglineZhHk: tagline(160), description: "d", descriptionZhHk: "d",
    }).success).toBe(true);
    expect(writerOutputSchema.profile.safeParse({
      taglineEn: tagline(161), taglineZhHk: "b", description: "d", descriptionZhHk: "d",
    }).success).toBe(false);
    expect(writerOutputSchema.listing.safeParse({
      taglineEn: tagline(240), taglineZhHk: tagline(240), descriptionEn: "d", descriptionZhHk: "d",
    }).success).toBe(true);
    expect(writerOutputSchema.listing.safeParse({
      taglineEn: tagline(241), taglineZhHk: "b", descriptionEn: "d", descriptionZhHk: "d",
    }).success).toBe(false);
  });

  it("refuses HTML and unknown keys", () => {
    expect(() => writerOutputSchema.event.parse({descriptionEn: "<b>x</b>", descriptionZh: "y"})).toThrow();
    expect(() => writerOutputSchema.event.parse({descriptionEn: "x", descriptionZh: "y", extra: "z"})).toThrow();
  });

  it("bounds the brief", () => {
    expect(writerBriefSchema.safeParse({kind: "event", brief: "x".repeat(2001)}).success).toBe(false);
    expect(writerBriefSchema.safeParse({kind: "not-a-kind", brief: "x"}).success).toBe(false);
    expect(writerBriefSchema.safeParse({kind: "event", brief: "  "}).success).toBe(false);
  });
});
