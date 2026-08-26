import {
  evidenceKinds,
  integrationDispositions,
  integrationKinds,
} from "@/config/wisetech-integration-manifest";
import type {
  DurableOwner,
  IntegrationManifestEntry,
} from "@/config/wisetech-integration-manifest";

export type RouteParityDestinations = Readonly<{
  appRoutes: ReadonlySet<string>;
  redirectSources: ReadonlySet<string>;
  conciergeActions: ReadonlySet<string>;
}>;

export type RouteParityErrorCode =
  | "duplicate-id"
  | "duplicate-source"
  | "missing-field"
  | "invalid-kind"
  | "invalid-disposition"
  | "invalid-evidence"
  | "invalid-destination"
  | "unresolved-destination"
  | "invalid-durable-owner"
  | "invalid-locale-mechanism";

export type RouteParityError = Readonly<{
  entryId: string;
  code: RouteParityErrorCode;
  reason: string;
}>;

const requiredFields = [
  "id",
  "kind",
  "source",
  "canonicalPath",
  "disposition",
  "dataOwner",
  "rationale",
  "evidence",
] as const;

const registerInterestOwners: readonly DurableOwner[] = [
  "published-event",
  "published-cohort",
  "crm-inquiry",
];

function routePath(value: string): string {
  const [withoutHash] = value.split("#", 1);
  const [withoutQuery] = (withoutHash ?? value).split("?", 1);
  return withoutQuery === "" ? "/" : withoutQuery ?? value;
}

function routeSegments(value: string): string[] {
  const normalized = routePath(value).replace(/\/$/, "");
  return normalized === "" ? [] : normalized.slice(1).split("/");
}

function isDynamicSegment(segment: string): boolean {
  return /^\[[^/]+\]$/.test(segment) || /^:[^/]+$/.test(segment);
}

function routeMatches(candidate: string, pattern: string): boolean {
  const candidateSegments = routeSegments(candidate);
  const patternSegments = routeSegments(pattern);
  return candidateSegments.length === patternSegments.length
    && patternSegments.every((segment, index) => (
      isDynamicSegment(segment)
      || isDynamicSegment(candidateSegments[index] ?? "")
      || segment === candidateSegments[index]
    ));
}

function isDestinationBacked(
  destination: string,
  destinations: RouteParityDestinations,
): boolean {
  const path = routePath(destination);
  const candidates = [
    ...destinations.appRoutes,
    ...destinations.redirectSources,
    ...destinations.conciergeActions,
  ];
  return candidates.some((candidate) => routeMatches(path, candidate));
}

function addError(
  errors: RouteParityError[],
  entryId: string,
  code: RouteParityErrorCode,
  reason: string,
): void {
  errors.push({entryId, code, reason});
}

function duplicates(values: readonly string[]): ReadonlySet<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return repeated;
}

export function validateRouteParity(
  inventory: readonly IntegrationManifestEntry[],
  destinations: RouteParityDestinations,
): readonly RouteParityError[] {
  const errors: RouteParityError[] = [];
  const duplicateIds = duplicates(inventory.map(({id}) => id));
  const duplicateSources = duplicates(inventory.map(({source}) => source));

  for (const entry of inventory) {
    const entryId = typeof entry.id === "string" && entry.id !== "" ? entry.id : "<missing-id>";
    for (const field of requiredFields) {
      const value = entry[field];
      if (value === undefined || (typeof value === "string" && value.trim() === "")) {
        addError(errors, entryId, "missing-field", `Required field ${field} is missing or empty.`);
      }
    }

    if (duplicateIds.has(entry.id)) {
      addError(errors, entryId, "duplicate-id", `ID ${entry.id} is not unique.`);
    }
    if (duplicateSources.has(entry.source)) {
      addError(errors, entryId, "duplicate-source", `Source ${entry.source} is not unique.`);
    }
    if (!integrationKinds.includes(entry.kind)) {
      addError(errors, entryId, "invalid-kind", `Kind ${entry.kind} is not supported.`);
    }
    if (!integrationDispositions.includes(entry.disposition)) {
      addError(errors, entryId, "invalid-disposition", `Disposition ${entry.disposition} is not supported.`);
    }
    if (!evidenceKinds.includes(entry.evidence)) {
      addError(errors, entryId, "invalid-evidence", `Evidence ${entry.evidence} is not supported.`);
    }

    if (entry.disposition === "retire" && entry.canonicalPath !== null) {
      addError(errors, entryId, "invalid-destination", "A retired entry must have canonicalPath null.");
    }
    if (entry.disposition !== "retire"
      && (typeof entry.canonicalPath !== "string" || entry.canonicalPath.trim() === "")) {
      addError(errors, entryId, "invalid-destination", "A non-retired entry requires a destination.");
    }

    if (entry.disposition !== "retire"
      && entry.kind !== "asset"
      && typeof entry.canonicalPath === "string") {
      const destinationChain = entry.destinationChain ?? [entry.canonicalPath];
      for (const destination of new Set(destinationChain)) {
        if (!isDestinationBacked(destination, destinations)) {
          addError(
            errors,
            entryId,
            "unresolved-destination",
            `Destination ${destination} has no App Router page, explicit redirect, or Concierge action.`,
          );
        }
      }
    }

    if (entry.source === "cta:register-interest") {
      const owners = entry.durableOwners ?? [];
      if (owners.length !== registerInterestOwners.length
        || registerInterestOwners.some((owner) => !owners.includes(owner))) {
        addError(
          errors,
          entryId,
          "invalid-durable-owner",
          "Register interest must be limited to published events, published cohorts, or CRM inquiries.",
        );
      }
    }

    if (entry.kind === "locale"
      && (entry.localeMechanism !== "next-intl-router-replace"
        || JSON.stringify(entry).includes("/zh-HK"))) {
      addError(
        errors,
        entryId,
        "invalid-locale-mechanism",
        "Locale switching must use next-intl router replacement and never build a /zh-HK browser path.",
      );
    }
  }

  return errors;
}
