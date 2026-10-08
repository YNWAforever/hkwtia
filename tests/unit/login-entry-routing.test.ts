import {describe, expect, it} from "vitest";
import {NextRequest} from "next/server";

import {anonymousAdminLoginRedirect, anonymousPortalLoginRedirect} from "@/proxy";

const cookie = "__Secure-neon-auth.session_token";

describe("anonymous admin entry", () => {
  it("retains a known Chinese admin deep link and filter", () => {
    const response = anonymousAdminLoginRedirect(new NextRequest("https://hkwtia.example/zh/admin/members?q=Acme&status=active"));
    expect(response?.status).toBe(307);
    const target = new URL(response!.headers.get("location")!);
    expect(target.pathname).toBe("/zh/admin-login");
    expect(target.searchParams.get("next")).toBe("/admin/members?q=Acme&status=active");
  });

  it("retains a validated event attendees view in the anonymous redirect", () => {
    const id = "1a538745-848b-448f-94d6-3b6a92f4e891";
    const response = anonymousAdminLoginRedirect(new NextRequest(`https://hkwtia.example/zh/admin/events-mgmt/${id}?tab=attendees&q=Acme`));
    expect(response?.status).toBe(307);
    const target = new URL(response!.headers.get("location")!);
    expect(target.pathname).toBe("/zh/admin-login");
    expect(target.searchParams.get("next")).toBe(`/admin/events-mgmt/${id}?tab=attendees&q=Acme`);
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

// The portal layout cannot see the requested path on a direct visit (no next-url header), so its
// redirect always sent a signed-out member to /portal. The proxy sees the path; it redirects first,
// exactly as it does for admin, and only for paths already on the portal continuation allowlist.
describe("anonymousPortalLoginRedirect", () => {
  it("sends a signed-out member to member sign-in returning to the page they asked for", () => {
    const response = anonymousPortalLoginRedirect(new NextRequest("https://hkwtia.example/portal/billing"));
    expect(response?.status).toBe(307);
    const target = new URL(response!.headers.get("location")!);
    expect(target.pathname).toBe("/member-login");
    expect(target.searchParams.get("next")).toBe("/portal/billing");
  });

  it("keeps the Chinese locale and an event edit deep link", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    const response = anonymousPortalLoginRedirect(new NextRequest(`https://hkwtia.example/zh/portal/events/${id}/edit`));
    const target = new URL(response!.headers.get("location")!);
    expect(target.pathname).toBe("/zh/member-login");
    expect(target.searchParams.get("next")).toBe(`/portal/events/${id}/edit`);
  });

  it("leaves signed-in visitors, unknown portal paths and the invitation accept page alone", () => {
    const signedIn = new NextRequest("https://hkwtia.example/portal/billing");
    signedIn.cookies.set(cookie, "session");
    expect(anonymousPortalLoginRedirect(signedIn)).toBeNull();
    expect(anonymousPortalLoginRedirect(new NextRequest("https://hkwtia.example/portal/unknown"))).toBeNull();
    expect(anonymousPortalLoginRedirect(new NextRequest("https://hkwtia.example/portal/company/seats/accept?token=t"))).toBeNull();
    expect(anonymousPortalLoginRedirect(new NextRequest("https://hkwtia.example/member-login"))).toBeNull();
  });
});
