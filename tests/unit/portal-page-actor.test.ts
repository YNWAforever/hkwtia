import {readdirSync, readFileSync, statSync} from "node:fs";
import {join} from "node:path";

import {beforeEach, describe, expect, it, vi} from "vitest";

const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`);
});
vi.mock("next/navigation", () => ({redirect: (path: string) => redirect(path)}));
const getActor = vi.fn();
vi.mock("@/lib/auth/actor", () => ({getActor: () => getActor()}));

import {memberLoginPath, portalPageActor} from "@/lib/portal/page-actor";

describe("portalPageActor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the signed-in actor without redirecting", async () => {
    const actor = {kind: "member", userId: "u", profileId: "p"};
    getActor.mockResolvedValue(actor);
    await expect(portalPageActor("en", "/portal/billing")).resolves.toBe(actor);
    expect(redirect).not.toHaveBeenCalled();
  });

  // A page-level requireActor() threw UNAUTHORIZED into the runtime log on every signed-out hit
  // (the layout redirects too, but Next renders layout and page in parallel), and the layout
  // cannot see the requested path on a direct visit, so it always sent the member to /portal.
  it("sends a signed-out visitor to member sign-in with this page as the continuation", async () => {
    getActor.mockResolvedValue(null);
    await expect(portalPageActor("en", "/portal/billing")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/member-login?next=%2Fportal%2Fbilling");
    await expect(portalPageActor("zh-HK", "/portal/events")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenLastCalledWith("/zh/member-login?next=%2Fportal%2Fevents");
  });

  it("builds the same sign-in path the layout uses", () => {
    expect(memberLoginPath("en", "/portal/tools")).toBe("/member-login?next=%2Fportal%2Ftools");
  });
});

// Every portal page reads its actor without throwing. Server actions inside a page still use
// requireActor() — an action has no layout to redirect for it. The accept page is token-gated,
// excluded from continuations, and already catches the error itself.
describe("portal pages read the actor without throwing", () => {
  const root = "app/[locale]/(member)/portal";
  const exempt = new Set([join(root, "company/seats/accept/page.tsx")]);
  function pages(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return pages(path);
      return name === "page.tsx" ? [path] : [];
    });
  }

  for (const page of pages(root).filter((path) => !exempt.has(path))) {
    it(`${page} does not call requireActor() before its own actor read`, () => {
      // Comments are dropped first: the pages explain this very rule by naming requireActor().
      const source = readFileSync(page, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      const body = source.slice(source.indexOf("export default async function"));
      const firstRead = body.search(/\b(portalPageActor|getActor|requireActor)\(/);
      if (firstRead === -1) return;
      expect(body.slice(firstRead).startsWith("requireActor(")).toBe(false);
    });
  }
});
