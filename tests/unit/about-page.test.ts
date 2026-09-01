import {describe, expect, it} from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

const approvedFacts = {
  en: {
    foundedTitle: "Established 2001",
    foundedBody: "WTIA is a not-for-profit trade association founded in 2001 for Hong Kong's wireless, mobile and emerging technology community.",
    missionTitle: "Our mission",
    missionBody: "To advance wireless, mobile and emerging technologies, accelerate their real-world adoption, and help shape Hong Kong into a top-class innovation and technology hub.",
  },
  "zh-HK": {
    foundedTitle: "成立於2001年",
    foundedBody: "香港無線科技商會（WTIA）成立於2001年，是一個非牟利貿易協會，服務香港無線、流動及新興科技社群。",
    missionTitle: "我們的使命",
    missionBody: "推動無線、流動及新興科技發展，加速其實際應用，協助香港發展成為頂尖創科樞紐。",
  },
} as const;

describe("about page copy", () => {
  it.each(["foundedTitle", "foundedBody", "missionTitle", "missionBody", "historyLink"])(
    "declares %s in both bundles",
    (key) => {
      expect(Object.keys(en.About)).toContain(key);
      expect(Object.keys(zh.About)).toContain(key);
    },
  );

  it.each([
    ["en", en.About],
    ["zh-HK", zh.About],
  ] as const)("pins the approved founding and mission facts in %s", (locale, messages) => {
    expect({
      foundedTitle: messages.foundedTitle,
      foundedBody: messages.foundedBody,
      missionTitle: messages.missionTitle,
      missionBody: messages.missionBody,
    }).toEqual(approvedFacts[locale]);
  });

  // The audit's headline finding was that the rebuilt About page never said
  // when WTIA was founded. Keep the year contract explicit as well as exact copy.
  it("states the founding year in both locales", () => {
    expect(en.About.foundedBody).toContain("2001");
    expect(zh.About.foundedBody).toContain("2001");
  });

  it("keeps every About key structurally aligned across locales", () => {
    expect(Object.keys(zh.About)).toEqual(Object.keys(en.About));
    for (const role of ["connect", "advance", "represent"] as const) {
      expect(Object.keys(zh.About[role])).toEqual(Object.keys(en.About[role]));
    }
  });

  it("gives the Chinese bundle real Chinese, not the English string", () => {
    for (const key of ["foundedTitle", "foundedBody", "missionTitle", "missionBody", "historyLink"] as const) {
      expect(zh.About[key], key).not.toBe(en.About[key]);
      expect(zh.About[key], key).toMatch(/[一-鿿]/);
    }
  });
});
