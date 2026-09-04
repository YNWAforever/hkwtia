import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
import {describe, expect, it} from "vitest";

import {
  conciergePromptSections,
  localizeConciergePrompts,
  resolveConciergePromptSection,
} from "@/lib/ai/concierge-prompts";

describe("concierge prompt sections", () => {
  it.each([
    ["/", "home"],
    ["/zh", "home"],
    ["/ai-ops", "home"],
    ["/membership", "membership"],
    ["/zh/membership", "membership"],
    ["/join", "membership"],
    ["/showcase", "showcase"],
    ["/zh/showcase/acme", "showcase"],
    ["/events", "events"],
    ["/zh/events/summit-2026", "events"],
  ] as const)("maps %s to the %s prompts", (pathname, section) => {
    expect(resolveConciergePromptSection(pathname)).toBe(section);
  });

  it("localizes a two-prompt pair per section from both bundles", () => {
    for (const bundle of [en, zh]) {
      const prompts = localizeConciergePrompts(
        (key) => (bundle.Concierge as {prompts: Record<string, unknown>}).prompts[key.split(".")[1]!],
      );
      for (const section of conciergePromptSections) {
        expect(prompts[section], section).toHaveLength(2);
        for (const prompt of prompts[section]) expect(prompt.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("degrades to no prompts when the bundle value is not a string array", () => {
    expect(localizeConciergePrompts(() => undefined).home).toEqual([]);
    expect(localizeConciergePrompts(() => ["ok", 7]).home).toEqual([]);
  });
});
