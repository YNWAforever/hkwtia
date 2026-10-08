import {describe, expect, it} from "vitest";

import {localizedEventTitle} from "@/lib/portal/event-title";

describe("localizedEventTitle", () => {
  it("uses the Chinese title on zh-HK", () => {
    expect(localizedEventTitle("zh-HK", {titleEn: "Open day", titleZh: "開放日"})).toBe("開放日");
  });

  it("falls back to English when the Chinese title is blank or missing", () => {
    expect(localizedEventTitle("zh-HK", {titleEn: "Open day", titleZh: ""})).toBe("Open day");
    expect(localizedEventTitle("zh-HK", {titleEn: "Open day", titleZh: "   "})).toBe("Open day");
    expect(localizedEventTitle("zh-HK", {titleEn: "Open day", titleZh: null})).toBe("Open day");
  });

  it("always uses English on en", () => {
    expect(localizedEventTitle("en", {titleEn: "Open day", titleZh: "開放日"})).toBe("Open day");
  });
});
