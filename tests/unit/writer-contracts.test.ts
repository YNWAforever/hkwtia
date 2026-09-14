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
