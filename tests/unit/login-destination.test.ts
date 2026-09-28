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

  it.each([
    "https://evil.example/admin", "//evil.example/admin", "/\\evil.example/admin",
    "/admin/unknown", "/admin/members/not-a-uuid", "/admin/members%2fqueue",
    "/admin/members%252fqueue", "/admin/members?returnTo=https%3A%2F%2Fevil.example",
    "/admin/members?q=ok#fragment", "/zh/admin/members", "/portal", "/adminx",
  ])("rejects unsafe or unknown admin destination %s", (raw) => {
    expect(parseLoginDestination(raw, "admin")).toEqual({intent: "admin", path: "/admin"});
  });
});
