import {
  protectedRouteClassifications,
  protectedRouteFamilies,
} from "@/config/wisetech-protected-route-inventory";
import type {
  ProtectedRouteClassification,
  ProtectedRouteFamily,
  ProtectedRouteOwner,
} from "@/config/wisetech-protected-route-inventory";

export type ProtectedRouteOwnershipInput = Readonly<{
  inventory: readonly ProtectedRouteOwner[];
  codeFiles: readonly string[];
}>;

export type ProtectedRouteOwnershipErrorCode =
  | "duplicate-protected-owner-id"
  | "duplicate-protected-owner-file"
  | "duplicate-protected-owner-route"
  | "invalid-protected-route-file"
  | "invalid-protected-route-owner"
  | "invalid-protected-route-classification"
  | "unowned-protected-route"
  | "missing-protected-route";

export type ProtectedRouteOwnershipError = Readonly<{
  entryId: string;
  code: ProtectedRouteOwnershipErrorCode;
  reason: string;
}>;

type DerivedProtectedRoute = Readonly<{
  family: ProtectedRouteFamily;
  classification: ProtectedRouteClassification;
  routePath: string;
  filePath: string;
}>;

function normalizedFilePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isRouteGroup(segment: string): boolean {
  return /^\([^/]+\)$/.test(segment);
}

function isValidRouteSegment(segment: string): boolean {
  if (!segment.includes("[") && !segment.includes("]")) return segment !== "";
  return /^\[[^.[\]/]+\]$/.test(segment)
    || /^\[\.\.\.[^[\]/]+\]$/.test(segment)
    || /^\[\[\.\.\.[^[\]/]+\]\]$/.test(segment);
}

export function appRouteFromFilePath(filePath: string): string {
  const normalized = normalizedFilePath(filePath);
  const segments = normalized.split("/");
  const convention = segments.at(-1);
  if (segments[0] !== "app" || (convention !== "page.tsx" && convention !== "route.ts")) {
    throw new Error(`Protected route file ${filePath} must be an app/**/page.tsx or app/**/route.ts file.`);
  }

  const routeSegments = segments.slice(1, -1).filter((segment) => !isRouteGroup(segment));
  if (routeSegments[0] === "[locale]") routeSegments.shift();
  const invalid = routeSegments.find((segment) => !isValidRouteSegment(segment));
  if (invalid !== undefined) {
    throw new Error(`Protected route file ${filePath} contains invalid route segment ${invalid}.`);
  }
  return routeSegments.length === 0 ? "/" : `/${routeSegments.join("/")}`;
}

function classificationForApiPath(routePath: string): ProtectedRouteClassification {
  const segments = routePath.split("/").filter(Boolean);
  if (segments[1] === "jobs") return "job-handler";
  if (segments.slice(1).some((segment) => segment === "webhook" || segment === "webhooks")) {
    return "webhook-handler";
  }
  return "api-handler";
}

function deriveProtectedRoute(filePath: string): DerivedProtectedRoute {
  const normalized = normalizedFilePath(filePath);
  const routePath = appRouteFromFilePath(normalized);
  if (normalized.endsWith("/page.tsx")
    && (routePath === "/admin" || routePath.startsWith("/admin/"))) {
    return {family: "admin", classification: "admin-page", routePath, filePath: normalized};
  }
  if (normalized.endsWith("/route.ts")
    && (routePath === "/api" || routePath.startsWith("/api/"))) {
    return {family: "api", classification: classificationForApiPath(routePath), routePath, filePath: normalized};
  }
  throw new Error(
    `Protected route file ${filePath} must own an /admin page.tsx or /api route.ts path.`,
  );
}

function duplicateValues(values: readonly string[]): ReadonlySet<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return duplicates;
}

function error(
  errors: ProtectedRouteOwnershipError[],
  entryId: string,
  code: ProtectedRouteOwnershipErrorCode,
  reason: string,
): void {
  errors.push({entryId, code, reason});
}

export function validateProtectedRouteOwnership(
  input: ProtectedRouteOwnershipInput,
): readonly ProtectedRouteOwnershipError[] {
  const errors: ProtectedRouteOwnershipError[] = [];
  const duplicateIds = duplicateValues(input.inventory.map(({id}) => id));
  const duplicateFiles = duplicateValues(input.inventory.map(({filePath}) => normalizedFilePath(filePath)));
  const duplicateRoutes = duplicateValues(input.inventory.map(({routePath}) => routePath));
  const codeByFile = new Map<string, DerivedProtectedRoute>();

  for (const filePath of input.codeFiles) {
    const normalized = normalizedFilePath(filePath);
    try {
      const route = deriveProtectedRoute(normalized);
      if (codeByFile.has(normalized)) {
        error(errors, normalized, "invalid-protected-route-file", `Protected code file ${normalized} is listed more than once.`);
      } else {
        codeByFile.set(normalized, route);
      }
    } catch (cause) {
      error(
        errors,
        normalized,
        "invalid-protected-route-file",
        cause instanceof Error ? cause.message : `Protected code file ${normalized} is invalid.`,
      );
    }
  }

  const ownerByFile = new Map<string, ProtectedRouteOwner>();
  for (const owner of input.inventory) {
    const filePath = normalizedFilePath(owner.filePath);
    if (duplicateIds.has(owner.id)) {
      error(errors, owner.id, "duplicate-protected-owner-id", `Protected owner ID ${owner.id} is not unique.`);
    }
    if (duplicateFiles.has(filePath)) {
      error(errors, owner.id, "duplicate-protected-owner-file", `Protected owner file ${filePath} is not unique.`);
    }
    if (duplicateRoutes.has(owner.routePath)) {
      error(errors, owner.id, "duplicate-protected-owner-route", `Protected owner route ${owner.routePath} is not unique.`);
    }
    if (!ownerByFile.has(filePath)) ownerByFile.set(filePath, owner);

    let derived: DerivedProtectedRoute | undefined;
    try {
      derived = deriveProtectedRoute(filePath);
    } catch (cause) {
      error(
        errors,
        owner.id,
        "invalid-protected-route-file",
        cause instanceof Error ? cause.message : `Protected owner file ${filePath} is invalid.`,
      );
    }
    if (derived === undefined) continue;

    const expectedPattern = derived.family === "admin" ? "/admin/*" : "/api/*";
    if (!protectedRouteFamilies.includes(owner.family)
      || owner.family !== derived.family
      || owner.routePath !== derived.routePath
      || owner.masterFamilyPattern !== expectedPattern
      || owner.familyEvidence !== "master-plan"
      || owner.routeEvidence !== "hkwtia-repository"
      || owner.dataOwner.trim() === "") {
      error(
        errors,
        owner.id,
        "invalid-protected-route-owner",
        `Owner must match ${derived.routePath}, ${derived.family}, ${expectedPattern}, and the binding evidence fields.`,
      );
    }
    if (!protectedRouteClassifications.includes(owner.classification)
      || owner.classification !== derived.classification) {
      error(
        errors,
        owner.id,
        "invalid-protected-route-classification",
        `${derived.routePath} must be classified as ${derived.classification}, not ${owner.classification}.`,
      );
    }
  }

  for (const [filePath, route] of codeByFile) {
    if (!ownerByFile.has(filePath)) {
      error(
        errors,
        filePath,
        "unowned-protected-route",
        `${route.routePath} exists in code but has no explicit protected route owner.`,
      );
    }
  }
  for (const [filePath, owner] of ownerByFile) {
    if (!codeByFile.has(filePath)) {
      error(
        errors,
        owner.id,
        "missing-protected-route",
        `${owner.routePath} is inventoried at ${filePath}, but that code route does not exist.`,
      );
    }
  }

  return errors;
}
