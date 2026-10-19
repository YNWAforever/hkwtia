import { describe, expect, it } from "vitest";

import {
  isPortalContinuation,
  parsePortalContinuation,
  PORTAL_CONTINUATIONS,
} from "@/lib/portal/continuation";

describe("PORTAL_CONTINUATIONS", () => {
  it("lists exactly the Portal's 12 static destinations", () => {
    expect(PORTAL_CONTINUATIONS).toEqual([
      "/portal",
      "/portal/applications",
      "/portal/profile",
      "/portal/company",
      "/portal/company/listing",
      "/portal/company/seats",
      "/portal/billing",
      "/portal/documents",
      "/portal/events",
      "/portal/events/my",
      "/portal/directory",
      "/portal/tools",
    ]);
  });

  it("excludes the one-time seat invitation acceptance route", () => {
    expect(PORTAL_CONTINUATIONS).not.toContain("/portal/company/seats/accept");
  });
});

describe("isPortalContinuation", () => {
  it("preserves only validated company and seat-batch context across sign-in", () => {
    const company = "11111111-1111-4111-8111-111111111111", batch = "22222222-2222-4222-8222-222222222222";
    for (const path of ["/portal/company", "/portal/company/listing", "/portal/company/seats"]) {
      expect(parsePortalContinuation(`${path}?companyId=${company}`)).toBe(`${path}?companyId=${company}`);
    }
    const target = `/portal/company/seats?companyId=${company}&batchId=${batch}`;
    expect(parsePortalContinuation(target)).toBe(target);
    for (const invalid of [`${target}&next=/admin`, `${target}&companyId=${company}`, `/portal/profile?companyId=${company}`, `/portal/company?companyId=${company}&batchId=${batch}`, "/portal/company?companyId=https://evil.test"]) {
      expect(parsePortalContinuation(invalid)).toBe("/portal");
    }
  });
  it("accepts every listed destination", () => {
    for (const path of PORTAL_CONTINUATIONS) {
      expect(isPortalContinuation(path)).toBe(true);
    }
  });

  it("accepts the member tools page so sign-in returns to it", () => {
    expect(isPortalContinuation("/portal/tools")).toBe(true);
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
    expect(parsePortalContinuation("/portal/tools")).toBe("/portal/tools");
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

  it("preserves private event and own-order destinations while rejecting unrelated query strings", () => {
    expect(isPortalContinuation(`/portal/events/${EVENT}`)).toBe(true);
    expect(isPortalContinuation(`/portal/orders/${EVENT}`)).toBe(true);
    expect(isPortalContinuation(`/portal/orders/${EVENT}?ticket=received`)).toBe(false);
    expect(isPortalContinuation("/portal/orders/https://evil.test")).toBe(false);
  });
  it("rejects malformed member event destinations", () => {
    expect(parsePortalContinuation("/portal/events/not-a-uuid/edit")).toBe("/portal");
    expect(isPortalContinuation(`/portal/events/${EVENT}/edit/`)).toBe(false);
    expect(isPortalContinuation(`/portal/events/${EVENT}/edit?x=1`)).toBe(false);
    expect(isPortalContinuation("/portal/events/new/../../admin")).toBe(false);
    // Version nibble must be 4: a uuid-shaped but non-v4 id is not one of ours.
    expect(isPortalContinuation("/portal/events/22222222-2222-1222-8222-222222222222/edit")).toBe(false);
  });
});

describe("member application deep links", () => {
  const APPLICATION = "33333333-3333-4333-8333-333333333333";

  it("returns a signed-out member to the exact application detail they requested", () => {
    expect(parsePortalContinuation(`/portal/applications/${APPLICATION}`)).toBe(`/portal/applications/${APPLICATION}`);
    expect(isPortalContinuation(`/portal/applications/${APPLICATION.toUpperCase()}`)).toBe(true);
  });

  it("rejects malformed or non-v4 application destinations", () => {
    expect(parsePortalContinuation("/portal/applications/not-a-uuid")).toBe("/portal");
    expect(isPortalContinuation("/portal/applications/33333333-3333-1333-8333-333333333333")).toBe(false);
    expect(isPortalContinuation(`/portal/applications/${APPLICATION}/edit`)).toBe(false);
    expect(isPortalContinuation(`/portal/applications/${APPLICATION}?next=/admin`)).toBe(false);
  });
});
