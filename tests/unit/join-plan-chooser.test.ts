import {describe, expect, it} from "vitest";

import {planChooserItems} from "@/lib/membership/join-plan-chooser";

describe("planChooserItems", () => {
  it("links self-serve plans to /join?plan= and patron to /contact, locale-prefixed", () => {
    const en = planChooserItems("en");
    expect(en.map((item) => item.code)).toEqual(["community", "startup", "corporate", "patron"]);
    expect(en.find((item) => item.code === "startup")?.href).toBe("/join?plan=startup");
    expect(en.find((item) => item.code === "patron")).toMatchObject({href: "/contact", kind: "contact"});

    const zh = planChooserItems("zh-HK");
    expect(zh.find((item) => item.code === "community")?.href).toBe("/zh/join?plan=community");
    expect(zh.find((item) => item.code === "patron")?.href).toBe("/zh/contact");
  });
});
