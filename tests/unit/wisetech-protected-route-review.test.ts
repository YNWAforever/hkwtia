import {describe, expect, it} from "vitest";

import type {ProtectedRouteOwner} from "@/config/wisetech-protected-route-inventory";
import * as protectedRoutes from "@/lib/integration/protected-route-ownership";
import {validateRouteParity} from "@/lib/integration/route-parity";
import type {RouteParityDestinations} from "@/lib/integration/route-parity";

function owner(
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
    dataOwner: "Hostile review fixture.",
    masterFamilyPattern: "/admin/*",
    familyEvidence: "master-plan",
    routeEvidence: "hkwtia-repository",
  };
}

describe("WiseTech protected-route re-review", () => {
  it("fails closed with a structured error when protected ownership is omitted at runtime", () => {
    const untypedDestinations = {
      appRoutes: new Set<string>(),
      redirects: new Map<string, string>(),
      conciergeActions: new Set<string>(),
    } as unknown as RouteParityDestinations;

    expect(validateRouteParity([], untypedDestinations)).toEqual([
      expect.objectContaining({
        entryId: "<protected-route-inventory>",
        code: "missing-protected-route-inventory",
      }),
    ]);
  });

  it("normalizes parallel slots and each interception convention segment-wise", () => {
    const cases = [
      ["app/[locale]/@modal/admin/page.tsx", "/admin"],
      ["app/[locale]/(.)admin/page.tsx", "/admin"],
      ["app/[locale]/(..)admin/page.tsx", "/admin"],
      ["app/[locale]/(...)admin/page.tsx", "/admin"],
      ["app/[locale]/(..)(..)admin/page.tsx", "/admin"],
      ["app/[locale]/(group)/admin/page.tsx", "/admin"],
      ["app/[locale]/@modal/(group)/(.)admin/members/[id]/page.tsx", "/admin/members/[id]"],
    ] as const;

    for (const [filePath, routePath] of cases) {
      expect(protectedRoutes.appRouteFromFilePath(filePath), filePath).toBe(routePath);
    }
  });

  it("removes locale when URL-less groups and slots precede it", () => {
    const cases = [
      ["app/(group)/[locale]/admin/hidden/page.tsx", "/admin/hidden"],
      ["app/(server)/[locale]/api/hidden/route.ts", "/api/hidden"],
      ["app/@slot/[locale]/admin/slot/page.tsx", "/admin/slot"],
    ] as const;

    for (const [filePath, routePath] of cases) {
      expect(protectedRoutes.appRouteFromFilePath(filePath), filePath).toBe(routePath);
    }
  });

  it("treats every private-folder subtree as a non-route", () => {
    expect(protectedRoutes.appRouteFromFilePath(
      "app/[locale]/_private/admin/page.tsx",
    )).toBeNull();
    expect(protectedRoutes.appRouteFromFilePath(
      "app/api/_internal/jobs/route.ts",
    )).toBeNull();
  });

  it("uses an exact admin boundary and rejects administrator", () => {
    const isProtectedAdminRoute = (
      protectedRoutes as typeof protectedRoutes & {isProtectedAdminRoute(route: string): boolean}
    ).isProtectedAdminRoute;

    expect(isProtectedAdminRoute).toBeTypeOf("function");
    expect(isProtectedAdminRoute("/admin")).toBe(true);
    expect(isProtectedAdminRoute("/admin/reports")).toBe(true);
    expect(isProtectedAdminRoute("/administrator")).toBe(false);
  });

  it("cannot hide an unowned route behind parallel/interception segments", () => {
    const codeFile = "app/[locale]/@modal/(.)admin/reports/page.tsx";
    const normalOwner = owner(
      "normal-admin-reports",
      "app/[locale]/admin/reports/page.tsx",
      "/admin/reports",
    );

    expect(protectedRoutes.validateProtectedRouteOwnership({
      inventory: [normalOwner],
      codeFiles: [codeFile],
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({entryId: codeFile, code: "unowned-protected-route"}),
      expect.objectContaining({entryId: normalOwner.id, code: "missing-protected-route"}),
    ]));
  });

  it("rejects an owner fabricated inside a private subtree while ignoring its non-route file", () => {
    const privateFile = "app/[locale]/_private/admin/page.tsx";
    const privateOwner = owner("private-admin-owner", privateFile, "/admin");

    expect(protectedRoutes.validateProtectedRouteOwnership({
      inventory: [privateOwner],
      codeFiles: [privateFile],
    })).toEqual([
      expect.objectContaining({
        entryId: privateOwner.id,
        code: "invalid-protected-route-file",
      }),
    ]);
  });
});
