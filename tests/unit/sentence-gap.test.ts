import {describe, expect, it} from "vitest";

import {sentenceGap} from "@/lib/i18n/sentence-gap";

// Two translated sentences rendered side by side need a space in English but none in Chinese:
// full-width punctuation already carries its own spacing, so 「。 」 shows a visible gap
// (round 19 found it on /zh/partners and the programme pages' winners line).
describe("sentenceGap", () => {
  it("adds a space after Latin text", () => {
    expect(sentenceGap("Listed by WTIA as a supporting organisation.")).toBe(" ");
    expect(sentenceGap("The full list is on the edition's microsite")).toBe(" ");
  });

  it("adds nothing after full-width punctuation", () => {
    for (const text of ["由 WTIA 列為支持機構。", "真的嗎？", "好！", "如下：", "見「網站」"]) expect(sentenceGap(text)).toBe("");
  });

  it("ignores trailing whitespace and treats empty text as needing no gap", () => {
    expect(sentenceGap("完整得獎名單刊於該屆的專題網站。  ")).toBe("");
    expect(sentenceGap("")).toBe("");
  });
});
