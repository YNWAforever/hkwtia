import {describe, expect, it} from "vitest";

import type {ProtectedRouteOwner} from "@/config/wisetech-protected-route-inventory";
import {
  appRouteFromFilePath,
  validateProtectedRouteOwnership,
} from "@/lib/integration/protected-route-ownership";

function adminOwner(
  id: string,
  filePath: string,
  routePath: string,
): ProtectedRouteOwner {
  return {
    id,
    family: "admin",
    classification: "admin-page",
    routePath,
    filePath,
    dataOwner: "Nested interception hostile fixture.",
    masterFamilyPattern: "/admin/*",
    familyEvidence: "master-plan",
    routeEvidence: "hkwtia-repository",
  };
}

describe("WiseTech protected-route interception traversal", () => {
  it("applies interception operations to the accumulated URL stack", () => {
    const cases = [
      ["app/[locale]/feed/@modal/(..)admin/page.tsx", "/admin"],
      ["app/[locale]/one/two/@modal/(..)(..)admin/page.tsx", "/admin"],
      ["app/[locale]/one/two/@modal/(...)admin/page.tsx", "/admin"],
      ["app/[locale]/feed/@modal/(.)admin/page.tsx", "/feed/admin"],
    ] as const;

    for (const [filePath, routePath] of cases) {
      expect(appRouteFromFilePath(filePath), filePath).toBe(routePath);
    }
  });

  it("clamps excess interception pops at the normalized route root", () => {
    expect(appRouteFromFilePath(
      "app/[locale]/@modal/(..)(..)admin/page.tsx",
    )).toBe("/admin");
  });

  it("cannot hide a protected admin page behind nested interception traversal", () => {
    const codeFile = "app/[locale]/feed/@modal/(..)admin/page.tsx";
    const ordinaryOwner = adminOwner(
      "ordinary-admin-owner",
      "app/[locale]/admin/page.tsx",
      "/admin",
    );

    expect(validateProtectedRouteOwnership({
      inventory: [ordinaryOwner],
      codeFiles: [codeFile],
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({entryId: codeFile, code: "unowned-protected-route"}),
      expect.objectContaining({entryId: ordinaryOwner.id, code: "missing-protected-route"}),
    ]));
  });
});
