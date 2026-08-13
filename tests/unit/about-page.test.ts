import {describe, expect, it} from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

describe("about page copy", () => {
  it.each(["foundedTitle", "foundedBody", "missionTitle", "missionBody", "historyLink"])(
    "declares %s in both bundles",
    (key) => {
      expect(Object.keys(en.About)).toContain(key);
      expect(Object.keys(zh.About)).toContain(key);
    },
  );

  // The audit's headline finding was that the rebuilt About page never said
  // when WTIA was founded.
  it("states the founding year in both locales", () => {
    expect(en.About.foundedBody).toContain("2001");
    expect(zh.About.foundedBody).toContain("2001");
  });

  it("gives the Chinese bundle real Chinese, not the English string", () => {
    for (const key of ["foundedTitle", "foundedBody", "missionTitle", "missionBody", "historyLink"] as const) {
      expect(zh.About[key], key).not.toBe(en.About[key]);
      expect(zh.About[key], key).toMatch(/[一-鿿]/);
    }
  });
});
