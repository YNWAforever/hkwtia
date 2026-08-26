import {readdirSync} from "node:fs";
import {join, relative, resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {protectedRouteOwnershipInventory} from "@/config/wisetech-protected-route-inventory";
import type {ProtectedRouteOwner} from "@/config/wisetech-protected-route-inventory";
import {
  appRouteFromFilePath,
  isProtectedAdminRoute,
  validateRouteParity,
} from "@/lib/integration/route-parity";

function filesNamed(directory: string, fileName: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap((item) => {
    const path = join(directory, item.name);
    if (item.isDirectory()) return filesNamed(path, fileName);
    return item.isFile() && item.name === fileName ? [path] : [];
  });
}

function repositoryProtectedFiles(): string[] {
  const root = process.cwd();
  const app = resolve(root, "app");
  const adminPages = filesNamed(resolve(app, "[locale]"), "page.tsx")
    .map((file) => relative(root, file).replaceAll("\\", "/"))
    .filter((file) => {
      const route = appRouteFromFilePath(file);
      return route !== null && isProtectedAdminRoute(route);
    });
  const apiHandlers = filesNamed(resolve(app, "api"), "route.ts")
    .map((file) => relative(root, file).replaceAll("\\", "/"))
    .filter((file) => appRouteFromFilePath(file) !== null);
  return [...adminPages, ...apiHandlers].sort();
}

function routeEntry(path: string) {
  return {
    id: `hostile-${path.replaceAll("/", "-")}`,
    kind: "route" as const,
    source: path,
    canonicalPath: path,
    disposition: "retain" as const,
    dataOwner: "Hostile fixture only.",
    rationale: "Exercises protected route ownership.",
    evidence: "hkwtia-repository" as const,
  };
}

describe("WiseTech protected route ownership", () => {
  it("rejects missing admin/API owners, a fabricated owner, and misclassified webhook/job handlers", () => {
    const inventory: readonly ProtectedRouteOwner[] = [
      {
        id: "fabricated-admin-owner",
        family: "admin",
        classification: "admin-page",
        routePath: "/admin/not-a-real-page",
        filePath: "app/[locale]/(admin)/admin/not-a-real-page/page.tsx",
        dataOwner: "Fabricated hostile fixture.",
        masterFamilyPattern: "/admin/*",
        familyEvidence: "master-plan",
        routeEvidence: "hkwtia-repository",
      },
      {
        id: "misclassified-job-owner",
        family: "api",
        classification: "api-handler",
        routePath: "/api/jobs/journey-runner",
        filePath: "app/api/jobs/journey-runner/route.ts",
        dataOwner: "Hostile job fixture.",
        masterFamilyPattern: "/api/*",
        familyEvidence: "master-plan",
        routeEvidence: "hkwtia-repository",
      },
      {
        id: "misclassified-webhook-owner",
        family: "api",
        classification: "job-handler",
        routePath: "/api/webhooks/woztell",
        filePath: "app/api/webhooks/woztell/route.ts",
        dataOwner: "Hostile webhook fixture.",
        masterFamilyPattern: "/api/*",
        familyEvidence: "master-plan",
        routeEvidence: "hkwtia-repository",
      },
    ];
    const codeFiles = [
      "app/[locale]/(admin)/admin/reports/page.tsx",
      "app/api/ai/concierge/route.ts",
      "app/api/jobs/journey-runner/route.ts",
      "app/api/webhooks/woztell/route.ts",
    ];
    const inventoryEntries = inventory.map((owner) => routeEntry(owner.routePath));
    const destinations = {
      appRoutes: new Set(inventory.map(({routePath}) => routePath)),
      redirects: new Map<string, string>(),
      conciergeActions: new Set<string>(),
      protectedRoutes: {inventory, codeFiles},
    };

    const errors = validateRouteParity(inventoryEntries, destinations);

    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({entryId: "app/[locale]/(admin)/admin/reports/page.tsx", code: "unowned-protected-route"}),
      expect.objectContaining({entryId: "app/api/ai/concierge/route.ts", code: "unowned-protected-route"}),
      expect.objectContaining({entryId: "fabricated-admin-owner", code: "missing-protected-route"}),
      expect.objectContaining({entryId: "misclassified-job-owner", code: "invalid-protected-route-classification"}),
      expect.objectContaining({entryId: "misclassified-webhook-owner", code: "invalid-protected-route-classification"}),
    ]));
  });

  it("normalizes route groups and every Next.js dynamic segment convention", () => {
    expect(appRouteFromFilePath(
      "app/[locale]/(admin)/admin/cohorts/[id]/page.tsx",
    )).toBe("/admin/cohorts/[id]");
    expect(appRouteFromFilePath(
      "app/(server)/api/auth/[...path]/route.ts",
    )).toBe("/api/auth/[...path]");
    expect(appRouteFromFilePath(
      "app/(server)/api/files/[[...path]]/route.ts",
    )).toBe("/api/files/[[...path]]");
    expect(appRouteFromFilePath(
      "app\\[locale]\\(admin)\\admin\\members\\[id]\\page.tsx",
    )).toBe("/admin/members/[id]");
  });

  it("keeps the explicit inventory bidirectionally equal to the current protected code surface", () => {
    const codeFiles = repositoryProtectedFiles();
    const inventoryFiles = protectedRouteOwnershipInventory.map(({filePath}) => filePath).sort();

    expect(inventoryFiles).toEqual(codeFiles);
    expect(validateRouteParity([], {
      appRoutes: new Set<string>(),
      redirects: new Map<string, string>(),
      conciergeActions: new Set<string>(),
      protectedRoutes: {inventory: protectedRouteOwnershipInventory, codeFiles},
    })).toEqual([]);
  });

  it("classifies all admin, general API, webhook, and job owners explicitly", () => {
    const count = (classification: ProtectedRouteOwner["classification"]) => (
      protectedRouteOwnershipInventory.filter((owner) => owner.classification === classification).length
    );

    expect(count("admin-page")).toBe(20);
    expect(count("api-handler")).toBe(6);
    expect(count("webhook-handler")).toBe(2);
    expect(count("job-handler")).toBe(9);
    expect(protectedRouteOwnershipInventory.filter(({family}) => family === "admin")).toHaveLength(20);
    expect(protectedRouteOwnershipInventory.filter(({family}) => family === "api")).toHaveLength(17);
  });

  it("deep-freezes the ownership inventory", () => {
    expect(Object.isFrozen(protectedRouteOwnershipInventory)).toBe(true);
    for (const owner of protectedRouteOwnershipInventory) expect(Object.isFrozen(owner), owner.id).toBe(true);
    expect(() => (protectedRouteOwnershipInventory as ProtectedRouteOwner[]).push(
      protectedRouteOwnershipInventory[0]!,
    )).toThrow(TypeError);
  });
});
