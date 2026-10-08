import {describe, expect, it} from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

describe("portal presentation", () => {
  it.each([
    [en.Portal.plans.community, "community"],
    [en.Portal.plans.startup, "startup"],
    [en.Portal.plans.corporate, "corporate"],
    [en.Portal.plans.patron, "patron"],
    [zh.Portal.plans.community, "community"],
    [zh.Portal.plans.startup, "startup"],
    [zh.Portal.plans.corporate, "corporate"],
    [zh.Portal.plans.patron, "patron"],
  ])("provides a translated plan label for %s", (label, code) => {
    expect(label).toBeTruthy();
    expect(label).not.toBe(code);
  });
});
