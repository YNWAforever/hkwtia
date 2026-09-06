import { describe, expect, it } from "vitest";

import {
  isPortalContinuation,
  parsePortalContinuation,
  PORTAL_CONTINUATIONS,
} from "@/lib/portal/continuation";

describe("PORTAL_CONTINUATIONS", () => {
  it("lists exactly the Portal's 9 real destinations", () => {
    expect(PORTAL_CONTINUATIONS).toEqual([
      "/portal",
      "/portal/profile",
      "/portal/company",
      "/portal/company/listing",
      "/portal/company/seats",
      "/portal/billing",
      "/portal/documents",
      "/portal/events",
      "/portal/directory",
    ]);
  });

  it("excludes the one-time seat invitation acceptance route", () => {
    expect(PORTAL_CONTINUATIONS).not.toContain("/portal/company/seats/accept");
  });
});

describe("isPortalContinuation", () => {
  it("accepts every listed destination", () => {
    for (const path of PORTAL_CONTINUATIONS) {
      expect(isPortalContinuation(path)).toBe(true);
    }
  });

  it("rejects the seat invitation acceptance route even though it is a real page", () => {
    expect(isPortalContinuation("/portal/company/seats/accept")).toBe(false);
  });

  it("rejects unrelated paths", () => {
    expect(isPortalContinuation("/admin")).toBe(false);
    expect(isPortalContinuation("/portal/company/seats/accept?token=abc")).toBe(
      false,
    );
    expect(isPortalContinuation("https://evil.example.com/portal")).toBe(false);
    expect(isPortalContinuation("/portal/../admin")).toBe(false);
  });
});

describe("parsePortalContinuation", () => {
  it("returns the path when it is a valid continuation", () => {
    expect(parsePortalContinuation("/portal/billing")).toBe("/portal/billing");
  });

  it("falls back to /portal for anything invalid or missing", () => {
    expect(parsePortalContinuation("/portal/company/seats/accept")).toBe(
      "/portal",
    );
    expect(parsePortalContinuation("/evil")).toBe("/portal");
    expect(parsePortalContinuation(null)).toBe("/portal");
    expect(parsePortalContinuation(undefined)).toBe("/portal");
  });
});
