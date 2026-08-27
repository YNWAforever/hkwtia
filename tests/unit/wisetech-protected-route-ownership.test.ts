import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {protectedRouteOwnershipInventory} from "@/config/wisetech-protected-route-inventory";
import type {ProtectedRouteOwner} from "@/config/wisetech-protected-route-inventory";
import {
  appRouteFromFilePath,
  validateRouteParity,
} from "@/lib/integration/route-parity";
import {repositoryProtectedFiles} from "@/tests/helpers/wisetech-protected-route-discovery";

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
  it("discovers protected routes outside conventional roots without admitting public decoys", () => {
    const root = mkdtempSync(join(tmpdir(), "wisetech-protected-routes-"));
    const fixtureFiles = [
      "app/[locale]/admin/conventional/page.tsx",
      "app/api/conventional/route.ts",
      "app/(group)/admin/grouped/page.tsx",
      "app/(server)/api/grouped/route.ts",
      "app/(group)/administrator/decoy/page.tsx",
      "app/(server)/public-api/decoy/route.ts",
    ];

    try {
      for (const file of fixtureFiles) {
        const absolute = resolve(root, file);
        mkdirSync(resolve(absolute, ".."), {recursive: true});
        writeFileSync(absolute, "export {};\n");
      }

      expect(repositoryProtectedFiles(root)).toEqual([
        "app/(group)/admin/grouped/page.tsx",
        "app/(server)/api/grouped/route.ts",
        "app/[locale]/admin/conventional/page.tsx",
        "app/api/conventional/route.ts",
      ]);
    } finally {
      rmSync(root, {recursive: true, force: true});
    }
  });

  it("discovers localized protected routes after URL-less groups and slots", () => {
    const root = mkdtempSync(join(tmpdir(), "wisetech-protected-locales-"));
    const fixtureFiles = [
      "app/(group)/[locale]/admin/hidden/page.tsx",
      "app/(server)/[locale]/api/hidden/route.ts",
      "app/@slot/[locale]/admin/slot/page.tsx",
    ];

    try {
      for (const file of fixtureFiles) {
        const absolute = resolve(root, file);
        mkdirSync(resolve(absolute, ".."), {recursive: true});
        writeFileSync(absolute, "export {};\n");
      }

      expect(repositoryProtectedFiles(root)).toEqual(fixtureFiles);
    } finally {
      rmSync(root, {recursive: true, force: true});
    }
  });

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

    expect(codeFiles).toHaveLength(37);
    expect(inventoryFiles).toHaveLength(37);
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
