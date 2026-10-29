import {describe, expect, it, vi} from "vitest";

import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_TTL_SECONDS,
  captureFirstTouch,
  decodeFirstTouch,
  encodeFirstTouch,
  isDocumentNavigation,
} from "@/lib/membership/attribution";
import {persistSignupAttribution} from "@/lib/membership/signup-attribution";
import type {Actor} from "@/lib/membership/lifecycle";

const member = {kind: "member", userId: "user-a", profileId: "profile-a"} as const satisfies Actor;
const applicationId = "33333333-3333-4333-8333-333333333333";

describe("first-touch attribution", () => {
  it("keeps campaign parameters, ref, referrer host, and the landing path, and drops the query string", () => {
    const touch = captureFirstTouch({
      href: "https://www.hkwtia.org/zh/join?plan=community&utm_source=ig&utm_medium=social&utm_campaign=launch&utm_term=wifi&utm_content=story&ref=ada&email=secret@example.test",
      referrer: "https://instagram.com/wtia/post?tracking=1",
    });
    expect(touch).toEqual({
      utmSource: "ig", utmMedium: "social", utmCampaign: "launch", utmTerm: "wifi", utmContent: "story",
      referralCode: "ada", referrerHost: "instagram.com", landingPath: "/zh/join",
    });
    expect(JSON.stringify(touch)).not.toContain("secret@example.test");
    expect(JSON.stringify(touch)).not.toContain("tracking");
  });

  it("does not replace a valid first-touch cookie and ignores prefetches", () => {
    const first = captureFirstTouch({href: "https://www.hkwtia.org/membership?utm_source=newsletter", referrer: null});
    const encoded = encodeFirstTouch(first);
    expect(decodeFirstTouch(encoded)).toEqual(first);
    expect(decodeFirstTouch("not a cookie")).toBeNull();
    expect(isDocumentNavigation(new Headers({"next-router-prefetch": "1"}), "GET")).toBe(false);
    expect(isDocumentNavigation(new Headers({"purpose": "prefetch"}), "GET")).toBe(false);
    expect(isDocumentNavigation(new Headers({"rsc": "1"}), "GET")).toBe(false);
    expect(isDocumentNavigation(new Headers(), "GET")).toBe(true);
    expect(ATTRIBUTION_TTL_SECONDS).toBe(90 * 24 * 60 * 60);
    expect(ATTRIBUTION_COOKIE).toBe("wtia_touch");
  });

  it("writes the application and, only when a contact was linked, that contact", async () => {
    const recordApplication = vi.fn(async () => undefined);
    const stampContact = vi.fn(async () => undefined);
    const touch = captureFirstTouch({href: "https://www.hkwtia.org/join?utm_source=ig&ref=ada", referrer: "https://news.example/story"});
    const stored = await persistSignupAttribution(member, applicationId, "  A friend  ", {contactId: "44444444-4444-4444-8444-444444444444", profileId: member.profileId}, {
      readCookie: async () => encodeFirstTouch(touch),
      recordApplication,
      stampContact,
    });
    expect(stored).toMatchObject({utmSource: "ig", referralCode: "ada", referrerHost: "news.example", heardAbout: "A friend", landingPath: "/join"});
    expect(recordApplication).toHaveBeenCalledWith(member, applicationId, stored);
    expect(stampContact).toHaveBeenCalledWith("44444444-4444-4444-8444-444444444444", member.profileId, stored);
  });

  it("does not invent a contact when none was linked", async () => {
    const stampContact = vi.fn(async () => undefined);
    await persistSignupAttribution(member, applicationId, null, null, {
      readCookie: async () => encodeFirstTouch(captureFirstTouch({href: "https://www.hkwtia.org/join", referrer: null})),
      recordApplication: async () => undefined,
      stampContact,
    });
    expect(stampContact).not.toHaveBeenCalled();
  });
});
