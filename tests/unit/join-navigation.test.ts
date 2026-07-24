import {describe, expect, it} from "vitest";

import {buildJoinCallback, destinationForJoin, parseJoinContinuation} from "@/lib/membership/join-navigation";

describe("join navigation", () => {
  it.each([
    ["profile", "page", "/zh/join/profile?plan=startup&application=application-a"],
    ["company", "page", "/zh/join/company?plan=startup&application=application-a"],
    ["checkout", "status", null],
    ["complete", "status", null],
    ["review", "status", null],
  ] as const)("maps the actor-scoped %s step without trusting a status query", (next, kind, href) => {
    expect(destinationForJoin("zh-HK", "startup", "application-a", next)).toEqual({kind, next, href});
  });

  it("builds the magic-link callback from APP_URL and an allowlisted path", () => {
    const callback = buildJoinCallback("https://preview.example.test", "zh-HK", "corporate", "/portal/profile");
    expect(callback).toBe("https://preview.example.test/zh/join?plan=corporate&next=%2Fportal%2Fprofile");
    expect(callback).not.toContain("evil.example");
  });

  it("builds an auth-only callback without inventing a membership plan", () => {
    const callback = buildJoinCallback("https://preview.example.test", "en", null, "/portal");
    expect(callback).toBe("https://preview.example.test/join?next=%2Fportal");
  });

  it.each([
    ["/portal", "en", "/portal"],
    ["/zh/portal/profile", "zh-HK", "/portal/profile"],
    ["/portal/company/seats", "en", "/portal/company/seats"],
  ] as const)("normalizes an allowlisted localized continuation %s", (value, locale, canonical) => {
    expect(parseJoinContinuation(value, locale)).toBe(canonical);
  });

  it.each(["https://evil.example/steal", "/portal?evil=1", "/portal#evil", "/portal\\company", "/admin", "/portal/admin", "/zh/admin"]) (
    "rejects an unsafe magic-link continuation %s",
    (continuation) => {
      expect(() => buildJoinCallback("https://preview.example.test", "en", "community", continuation)).toThrow("INVALID_CONTINUATION");
    },
  );

  it.each(["javascript:alert(1)", "https://user:pass@preview.example.test"])("rejects an invalid APP_URL %s", (appUrl) => {
    expect(() => buildJoinCallback(appUrl, "en", "community")).toThrow("INVALID_APP_URL");
  });
});
