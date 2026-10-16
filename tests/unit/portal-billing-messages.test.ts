import {createTranslator} from "next-intl";
import {describe, expect, it} from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

// The billing card's seat and plan lines, through the real catalogues and ICU formatting: the key-echo
// mocks in the page tests cannot see "1 seats" (final review I2) or a bare 「初創」 heading (M13).
const tEn = createTranslator({locale: "en", messages: en, namespace: "Portal"});
const tZh = createTranslator({locale: "zh-HK", messages: zh, namespace: "Portal"});

describe("billing messages", () => {
  it("pluralises the English seat count", () => {
    expect(tEn("billing.seats", {count: 1})).toBe("1 seat");
    expect(tEn("billing.seats", {count: 3})).toBe("3 seats");
  });

  it("uses one Chinese form for every seat count", () => {
    expect(tZh("billing.seats", {count: 1})).toBe("1 個席位");
    expect(tZh("billing.seats", {count: 3})).toBe("3 個席位");
  });

  it("reads the plan heading as a membership in Chinese and leaves English as the plan name", () => {
    expect(tEn("billing.planHeading", {plan: tEn("plans.startup")})).toBe("Startup");
    expect(tZh("billing.planHeading", {plan: tZh("plans.startup")})).toBe("初創會籍");
  });
});
