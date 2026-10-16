import {describe, expect, it} from "vitest";
import {unstable_doesMiddlewareMatch} from "next/experimental/testing/server";
import {NextRequest} from "next/server";

import middleware, {config} from "@/proxy";
import {signPassToken} from "@/lib/tickets/pass-token";

const token = signPassToken({seatId: "11111111-1111-4111-8111-111111111111", eventId: "22222222-2222-4222-8222-222222222222"}, "synthetic-test-secret");
const matches = (path: string, candidate: Parameters<typeof unstable_doesMiddlewareMatch>[0]["config"] = config) => unstable_doesMiddlewareMatch({config: candidate, url: `https://example.test${path}`});

describe("signed ticket URL locale routing", () => {
  it.each(["/pass/", "/zh/pass/", "/admin/check-in/", "/zh/admin/check-in/"])("routes the real dotted token under %s", (prefix) => {
    expect(token.split(".")).toHaveLength(2);
    expect(matches(prefix + token)).toBe(true);
  });

  it.each(["/api/stripe/webhook", "/_next/static/app.js", "/_vercel/insights/script.js", "/images/logo.png", "/robots.txt", "/unrelated/file.pdf"])("keeps infrastructure and static paths excluded: %s", (path) => {
    expect(matches(path)).toBe(false);
  });

  it("detects the former dot exclusion while retaining ordinary locale routes", () => {
    const former = {matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)"};
    expect(matches("/pass/" + token, former)).toBe(false);
    expect(matches("/zh/events", former)).toBe(true);
    expect(matches("/zh/events")).toBe(true);
  });

  it.each([["", "en"], ["/zh", "zh-HK"]])("rewrites %s signed passes to the intended internal locale", async (prefix, locale) => {
    const response = await middleware(new NextRequest(`https://example.test${prefix}/pass/${token}`));
    expect(new URL(response.headers.get("x-middleware-rewrite")!).pathname).toBe(`/${locale}/pass/${token}`);
  });
});
