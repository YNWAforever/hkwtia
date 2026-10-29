import {describe, expect, it} from "vitest";

import {planChooserItems} from "@/lib/membership/join-plan-chooser";

describe("planChooserItems", () => {
  it("links the ops tiers to /join?plan=, locale-prefixed", () => {
    const en = planChooserItems("en");
    expect(en.map((item) => item.code)).toEqual(["individual", "corporate", "platinum"]);
    expect(en.find((item) => item.code === "individual")).toMatchObject({href: "/join?plan=individual", annualPriceHkd: 500});
    expect(en.find((item) => item.code === "corporate")?.annualPriceHkd).toBe(1800);
    expect(en.find((item) => item.code === "platinum")?.annualPriceHkd).toBe(4800);

    const zh = planChooserItems("zh-HK");
    expect(zh.find((item) => item.code === "individual")?.href).toBe("/zh/join?plan=individual");
    expect(zh.find((item) => item.code === "platinum")?.href).toBe("/zh/join?plan=platinum");
  });
});
