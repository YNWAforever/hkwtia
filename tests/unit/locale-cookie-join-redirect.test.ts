import {NextRequest} from "next/server";
import {describe, expect, it} from "vitest";

import middleware from "@/proxy";

/**
 * next-intl localePrefix "as-needed" (i18n/routing.ts) leaves English unprefixed.
 * localeDetection stays on, so an unprefixed URL has no prefix to win priority 1.
 * The middleware then uses the NEXT_LOCALE cookie (priority 2) and only then
 * Accept-Language (priority 3). A Chinese cookie therefore redirects /join to
 * /zh/join. That is the same rule tests/unit/unsubscribe.test.ts already relies
 * on for /unsubscribe. It is not a join-route bug.
 */
function request(path: string, headers?: HeadersInit) {
  return new NextRequest(new URL(path, "https://hkwtia.example"), {headers});
}

function pathname(header: string | null) {
  return header ? new URL(header, "https://hkwtia.example").pathname : null;
}

describe("unprefixed /join after a Chinese session", () => {
  it("redirects /join to /zh/join when NEXT_LOCALE is zh-HK", async () => {
    const response = await middleware(request("/join", {cookie: "NEXT_LOCALE=zh-HK"}));

    expect(response.status).toBe(307);
    expect(pathname(response.headers.get("location"))).toBe("/zh/join");
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("keeps /join in English when the cookie is en, even if Accept-Language prefers Chinese", async () => {
    const response = await middleware(request("/join", {
      cookie: "NEXT_LOCALE=en",
      "accept-language": "zh-HK,zh;q=0.9,en;q=0.8",
    }));

    expect(pathname(response.headers.get("location"))).toBeNull();
    expect(pathname(response.headers.get("x-middleware-rewrite"))).toBe("/en/join");
  });

  it("redirects /join from Accept-Language only when no locale cookie is set", async () => {
    const response = await middleware(request("/join", {"accept-language": "zh-HK,zh;q=0.9"}));

    expect(response.status).toBe(307);
    expect(pathname(response.headers.get("location"))).toBe("/zh/join");
  });

  it("lets an explicit /zh prefix beat an English cookie", async () => {
    const response = await middleware(request("/zh/join", {cookie: "NEXT_LOCALE=en"}));

    expect(pathname(response.headers.get("location"))).toBeNull();
    expect(pathname(response.headers.get("x-middleware-rewrite"))).toBe("/zh-HK/join");
  });

  it("records zh-HK on the cookie when the visitor opens /zh/membership without one", async () => {
    const response = await middleware(request("/zh/membership"));
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(setCookie).toContain("NEXT_LOCALE=zh-HK");
  });
});
