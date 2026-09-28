import {describe, expect, it} from "vitest";

import {parseLoginDestination} from "@/lib/auth/login-destination";

const uuid = "1a538745-848b-448f-94d6-3b6a92f4e891";

describe("login destination allowlist", () => {
  it("defaults each intent when no destination was supplied", () => {
    expect(parseLoginDestination(null, "member")).toEqual({intent: "member", path: "/portal"});
    expect(parseLoginDestination(null, "admin")).toEqual({intent: "admin", path: "/admin"});
  });

  it("preserves member continuations but never crosses into admin", () => {
    expect(parseLoginDestination("/portal/billing", "member").path).toBe("/portal/billing");
    expect(parseLoginDestination("/admin/members", "member").path).toBe("/portal");
  });

  it("preserves only validated Join plans and owned application hints for members", () => {
    expect(parseLoginDestination(`/join?plan=startup&application=${uuid}`, "member").path)
      .toBe(`/join?plan=startup&application=${uuid}`);
    expect(parseLoginDestination("/join?next=%2Fportal%2Fcompany", "member").path)
      .toBe("/join?next=%2Fportal%2Fcompany");
    for (const raw of ["/join?plan=made-up", "/join?plan=startup&application=not-a-uuid", "/join?next=https%3A%2F%2Fevil.example", "/join?plan=community&role=staff", "/join#fragment"]) {
      expect(parseLoginDestination(raw, "member").path).toBe("/portal");
    }
  });
  it("preserves known admin pages, details and bounded list filters", () => {
    expect(parseLoginDestination("/admin/inbox", "admin").path).toBe("/admin/inbox");
    expect(parseLoginDestination(`/admin/members/${uuid}`, "admin").path).toBe(`/admin/members/${uuid}`);
    expect(parseLoginDestination("/admin/members?q=Harbour&status=active", "admin").path)
      .toBe("/admin/members?q=Harbour&status=active");
    expect(parseLoginDestination("/admin/members/queue?status=draft&q=Acme", "admin").path)
      .toBe("/admin/members/queue?status=draft&q=Acme");
    expect(parseLoginDestination("/admin/batches?state=ready&operation=profile_patch", "admin").path)
      .toBe("/admin/batches?state=ready&operation=profile_patch");
  });

  it("keeps validated event and Member360 detail views through sign-in", () => {
    expect(parseLoginDestination(`/admin/events-mgmt/${uuid}?tab=attendees&q=Acme&cursor=abc`, "admin").path)
      .toBe(`/admin/events-mgmt/${uuid}?tab=attendees&q=Acme&cursor=abc`);
    expect(parseLoginDestination(`/admin/members/${uuid}?section=notes&historyQ=Renewal&historyCursor=abc`, "admin").path)
      .toBe(`/admin/members/${uuid}?section=notes&historyQ=Renewal&historyCursor=abc`);
  });

  it.each(["tab=unknown", "tab=attendees&returnTo=https%3A%2F%2Fevil.example", "tab=orders%0A", "tab=content#fragment"])("rejects unsafe event detail query %s", (query) => {
    expect(parseLoginDestination(`/admin/events-mgmt/${uuid}?${query}`, "admin").path).toBe("/admin");
  });
  it.each([
    "https://evil.example/admin", "//evil.example/admin", "/\\evil.example/admin",
    "/admin/unknown", "/admin/members/not-a-uuid", "/admin/members%2fqueue",
    "/admin/members%252fqueue", "/admin/members?returnTo=https%3A%2F%2Fevil.example",
    "/admin/members?q=ok#fragment", "/zh/admin/members", "/portal", "/adminx",
  ])("rejects unsafe or unknown admin destination %s", (raw) => {
    expect(parseLoginDestination(raw, "admin")).toEqual({intent: "admin", path: "/admin"});
  });
});
