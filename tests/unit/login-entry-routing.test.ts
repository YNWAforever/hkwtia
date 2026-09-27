import {describe, expect, it} from "vitest";
import {NextRequest} from "next/server";

import {anonymousAdminLoginRedirect} from "@/proxy";

const cookie = "__Secure-neon-auth.session_token";

describe("anonymous admin entry", () => {
  it("retains a known Chinese admin deep link and filter", () => {
    const response = anonymousAdminLoginRedirect(new NextRequest("https://hkwtia.example/zh/admin/members?q=Acme&status=active"));
    expect(response?.status).toBe(307);
    const target = new URL(response!.headers.get("location")!);
    expect(target.pathname).toBe("/zh/admin-login");
    expect(target.searchParams.get("next")).toBe("/admin/members?q=Acme&status=active");
  });

  it("does not intercept known routes for a visitor carrying a session cookie", () => {
    const request = new NextRequest("https://hkwtia.example/admin/members");
    request.cookies.set(cookie, "session");
    expect(anonymousAdminLoginRedirect(request)).toBeNull();
  });

  it("leaves unknown admin paths to the real private 404", () => {
    expect(anonymousAdminLoginRedirect(new NextRequest("https://hkwtia.example/admin/unknown"))).toBeNull();
  });

  it("does not redirect public login or API routes", () => {
    expect(anonymousAdminLoginRedirect(new NextRequest("https://hkwtia.example/zh/admin-login"))).toBeNull();
    expect(anonymousAdminLoginRedirect(new NextRequest("https://hkwtia.example/api/admin/members"))).toBeNull();
  });
});
