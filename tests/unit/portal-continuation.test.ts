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

describe("member event deep links", () => {
  const EVENT = "22222222-2222-4222-8222-222222222222";

  it("accepts the two member event editor shapes so sign-in returns to them", () => {
    expect(parsePortalContinuation("/portal/events/new")).toBe("/portal/events/new");
    expect(parsePortalContinuation(`/portal/events/${EVENT}/edit`)).toBe(`/portal/events/${EVENT}/edit`);
    expect(isPortalContinuation(`/portal/events/${EVENT.toUpperCase()}/edit`)).toBe(true);
  });

  it("rejects anything under /portal/events that is not new or a v4 uuid edit", () => {
    expect(parsePortalContinuation("/portal/events/not-a-uuid/edit")).toBe("/portal");
    expect(isPortalContinuation(`/portal/events/${EVENT}`)).toBe(false);
    expect(isPortalContinuation(`/portal/events/${EVENT}/edit/`)).toBe(false);
    expect(isPortalContinuation(`/portal/events/${EVENT}/edit?x=1`)).toBe(false);
    expect(isPortalContinuation("/portal/events/new/../../admin")).toBe(false);
    // Version nibble must be 4: a uuid-shaped but non-v4 id is not one of ours.
    expect(isPortalContinuation("/portal/events/22222222-2222-1222-8222-222222222222/edit")).toBe(false);
  });
});
