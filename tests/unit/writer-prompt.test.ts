import {describe, expect, it} from "vitest";

import {WRITER_KINDS} from "@/lib/ai/writers/contracts";
import {writerSystemPrompt} from "@/config/agents/writer";

describe("writerSystemPrompt", () => {
  it("asks for JSON only, both languages, no HTML, and no invented facts", () => {
    const prompt = writerSystemPrompt("event");
    expect(prompt).toMatch(/JSON/i);
    expect(prompt).toMatch(/English/);
    expect(prompt).toMatch(/繁體|Chinese/);
    expect(prompt).toMatch(/HTML/i);
    expect(prompt).toMatch(/invent|do not add facts|never fabricate/i);
  });

  it.each([
    ["profile", "taglineEn"],
    ["listing", "descriptionEn"],
    ["event", "descriptionZh"],
  ] as const)("names the %s fields, including %s", (kind, field) => {
    expect(writerSystemPrompt(kind)).toContain(field);
  });

  it("covers every kind", () => {
    for (const kind of WRITER_KINDS) expect(writerSystemPrompt(kind).length).toBeGreaterThan(0);
  });
});
