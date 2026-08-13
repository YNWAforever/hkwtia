import {beforeEach, describe, expect, it, vi} from "vitest";

import {createUnsubscribePost} from "@/lib/api/unsubscribe-route";
import {unsubscribeUrls} from "@/lib/jobs/runners";

/**
 * RFC 8058 one-click unsubscribe, end to end.
 *
 * The regression this pins: the runner built one URL — the localized
 * confirmation page — and `renderEmail` put it in `List-Unsubscribe` alongside
 * `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. That combination makes
 * Gmail, Yahoo and Apple Mail POST the header's URL directly, and the page is a
 * Next.js page with no POST handler, so every provider-issued unsubscribe took
 * a 405 and no suppression row was written. The recipient's client reported
 * success and the marketing mail kept arriving.
 *
 * It went unnoticed because the render test supplied `/api/unsubscribe` as its
 * fixture — a value the runner never actually produced. So this asserts against
 * the real builder, and then feeds the URL it produces to the real POST handler
 * rather than trusting either end in isolation.
 */
const SECRET = "unsubscribe-token-secret-at-least-32-bytes";
const CRON = "cron-secret-at-least-thirty-two-bytes-x";
const APP_URL = "https://www.hkwtia.org";
const NOW = new Date("2026-08-11T00:00:00.000Z");

describe("RFC 8058 one-click unsubscribe", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("UNSUBSCRIBE_TOKEN_SECRET", SECRET);
    vi.stubEnv("CRON_SECRET", CRON);
    vi.stubEnv("APP_URL", APP_URL);
  });

  it("names a POST-capable route, not the confirmation page", () => {
    const {pageUrl, oneClickUrl} = unsubscribeUrls("profile-1", "en", NOW);

    expect(new URL(pageUrl).pathname).toBe("/unsubscribe");
    expect(new URL(oneClickUrl).pathname).toBe("/api/unsubscribe");
    expect(oneClickUrl).not.toBe(pageUrl);
  });

  it("keeps the visible link localized while the endpoint stays unprefixed", () => {
    const en = unsubscribeUrls("profile-1", "en", NOW);
    const zh = unsubscribeUrls("profile-1", "zh-HK", NOW);

    expect(new URL(en.pageUrl).pathname).toBe("/unsubscribe");
    expect(new URL(zh.pageUrl).pathname).toBe("/zh/unsubscribe");
    // /api is excluded from the proxy matcher, so a locale prefix there would
    // resolve to nothing.
    expect(new URL(zh.oneClickUrl).pathname).toBe("/api/unsubscribe");
  });

  it("signs one token that both URLs carry", () => {
    const {pageUrl, oneClickUrl} = unsubscribeUrls("profile-1", "en", NOW);

    const pageToken = new URL(pageUrl).searchParams.get("token");
    const oneClickToken = new URL(oneClickUrl).searchParams.get("token");

    expect(pageToken).toBeTruthy();
    expect(oneClickToken).toBe(pageToken);
  });

  it("suppresses the profile when a provider posts the header URL", async () => {
    const unsubscribeEmailMarketing = vi.fn(async () => "created" as const);
    const post = createUnsubscribePost({
      secrets: [SECRET],
      appUrl: APP_URL,
      unsubscribeEmailMarketing,
    });

    const {oneClickUrl} = unsubscribeUrls("profile-42", "en", NOW);
    // Exactly what a conforming provider sends: a POST to the header URL with
    // the RFC 8058 body and no interactive step.
    const response = await post(new Request(oneClickUrl, {
      method: "POST",
      headers: {"content-type": "application/x-www-form-urlencoded"},
      body: "List-Unsubscribe=One-Click",
    }));

    expect(response.status).toBe(200);
    expect(unsubscribeEmailMarketing).toHaveBeenCalledWith("profile-42");
  });

  it("would have caught the regression: the page URL is not actionable", async () => {
    const unsubscribeEmailMarketing = vi.fn(async () => "created" as const);
    const post = createUnsubscribePost({
      secrets: [SECRET],
      appUrl: APP_URL,
      unsubscribeEmailMarketing,
    });

    // The page URL carries a valid token, so the handler would honour it — but
    // a provider never reaches this handler with it, because /unsubscribe
    // routes to the page. Asserting the paths differ is what keeps the header
    // pointed at the route handler.
    const {pageUrl, oneClickUrl} = unsubscribeUrls("profile-42", "en", NOW);
    expect(new URL(pageUrl).pathname).not.toBe(new URL(oneClickUrl).pathname);

    const response = await post(new Request(pageUrl, {
      method: "POST",
      headers: {"content-type": "application/x-www-form-urlencoded"},
      body: "List-Unsubscribe=One-Click",
    }));
    // Proves the token itself was never the problem: same token, same handler,
    // same result. Only the path in the header was wrong.
    expect(response.status).toBe(200);
  });
});
