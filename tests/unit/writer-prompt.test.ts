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

  it.each([
    ["profile", 160],
    ["listing", 240],
  ] as const)("states the %s tagline character bound", (kind, bound) => {
    // The model is held to the same limit the output schema enforces: an
    // over-long field rejects the whole response and still spends a quota unit.
    expect(writerSystemPrompt(kind)).toContain(`${bound} characters`);
  });

  it.each(WRITER_KINDS)("states the %s description character bound", (kind) => {
    expect(writerSystemPrompt(kind)).toContain("2000 characters");
  });

  it("covers every kind", () => {
    for (const kind of WRITER_KINDS) expect(writerSystemPrompt(kind).length).toBeGreaterThan(0);
  });
});
