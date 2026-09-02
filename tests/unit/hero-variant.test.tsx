import {describe, expect, it} from "vitest";

import {
  DEFAULT_HEADER_VARIANT,
  heroVariantByRoute,
  resolveHeaderVariant,
} from "@/lib/public-shell/hero-variant";

describe("hero variant", () => {
  it("keeps the overlay list to routes that open with a full-bleed hero", () => {
    expect(heroVariantByRoute).toEqual({"/": "overlay"});
    expect(DEFAULT_HEADER_VARIANT).toBe("solid");
  });

  it.each([
    ["/", "overlay"],
    ["/events", "solid"],
    ["/about/history", "solid"],
    ["/unknown", "solid"],
    ["/events/", "solid"],
  ] as const)("resolves %s to %s", (pathname, variant) => {
    expect(resolveHeaderVariant(pathname)).toBe(variant);
  });
});
