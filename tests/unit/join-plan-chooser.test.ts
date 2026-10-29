import {describe, expect, it} from "vitest";

import {planChooserItems} from "@/lib/membership/join-plan-chooser";

describe("planChooserItems", () => {
  it("links every tier to /join?plan=, including patron, locale-prefixed", () => {
    const en = planChooserItems("en");
    expect(en.map((item) => item.code)).toEqual(["community", "startup", "corporate", "patron"]);
    expect(en.find((item) => item.code === "startup")?.href).toBe("/join?plan=startup");
    expect(en.find((item) => item.code === "patron")).toMatchObject({href: "/join?plan=patron", kind: "join"});

    const zh = planChooserItems("zh-HK");
    expect(zh.find((item) => item.code === "community")?.href).toBe("/zh/join?plan=community");
    expect(zh.find((item) => item.code === "patron")?.href).toBe("/zh/join?plan=patron");
  });
});
