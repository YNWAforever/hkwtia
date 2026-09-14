import {describe, expect, it} from "vitest";

import en from "@/messages/en.json";
import zhHK from "@/messages/zh-HK.json";

const KEYS = [
  "writer.label", "writer.briefLabel", "writer.briefPlaceholder", "writer.generate", "writer.generating",
  "writer.quota", "writer.quotaUnlimited",
  "writer.errors.INVALID", "writer.errors.FORBIDDEN", "writer.errors.NOT_ENTITLED",
  "writer.errors.QUOTA_EXCEEDED", "writer.errors.UNAVAILABLE", "writer.errors.FAILED",
] as const;

function resolve(bundle: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle);
}

describe("writer messages", () => {
  it.each(KEYS)("resolves Portal.%s in both bundles", (key) => {
    // A missing key renders as the literal key at runtime and no other test
    // would notice, because the pages only pass keys through.
    expect(typeof resolve(en.Portal as Record<string, unknown>, key)).toBe("string");
    expect(typeof resolve(zhHK.Portal as Record<string, unknown>, key)).toBe("string");
  });

  it("keeps the quota line's placeholders in both bundles", () => {
    const english = resolve(en.Portal as Record<string, unknown>, "writer.quota") as string;
    const chinese = resolve(zhHK.Portal as Record<string, unknown>, "writer.quota") as string;
    for (const value of [english, chinese]) {
      expect(value).toContain("{remaining}");
      expect(value).toContain("{cap}");
    }
  });
});
