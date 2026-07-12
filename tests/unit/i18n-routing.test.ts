import {describe, expect, it} from "vitest";

import {routing} from "@/i18n/routing";

describe("i18n routing", () => {
  it("keeps English unprefixed and maps Traditional Chinese to /zh", () => {
    expect(routing.locales).toEqual(["en", "zh-HK"]);
    expect(routing.defaultLocale).toBe("en");
    expect(routing.localePrefix).toEqual({
      mode: "as-needed",
      prefixes: {"zh-HK": "/zh"},
    });
  });
});
