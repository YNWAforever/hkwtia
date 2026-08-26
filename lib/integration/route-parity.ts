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
  redirects: ReadonlyMap<string, string>;
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
  | "invalid-destination-chain"
  | "unresolved-destination"
  | "invalid-redirect"
  | "invalid-durable-owner"
  | "invalid-durable-outcome"
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

const registerInterestOutcomes: readonly Readonly<{
  destination: string;
  owner: DurableOwner;
}>[] = [
  {destination: "/events", owner: "events"},
  {destination: "/launchpad", owner: "cohorts"},
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

function routeMatchesRepositoryPattern(candidate: string, repositoryPattern: string): boolean {
  const candidateSegments = routeSegments(candidate);
  const patternSegments = routeSegments(repositoryPattern);
  return candidateSegments.length === patternSegments.length
    && patternSegments.every((segment, index) => (
      isDynamicSegment(segment) || segment === candidateSegments[index]
    ));
}

function isDestinationBacked(
  destination: string,
  destinations: RouteParityDestinations,
): boolean {
  const path = routePath(destination);
  const repositoryPatterns = [
    ...destinations.appRoutes,
    ...destinations.redirects.keys(),
    ...destinations.conciergeActions,
  ];
  return repositoryPatterns.some((pattern) => routeMatchesRepositoryPattern(path, pattern));
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

function sameOrderedValues(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length
    && expected.every((value, index) => actual[index] === value);
}

function validateDestinationChain(
  entry: IntegrationManifestEntry,
  errors: RouteParityError[],
  entryId: string,
): void {
  if (entry.destinationChain === undefined) return;
  if (entry.destinationChain.length === 0) {
    addError(
      errors,
      entryId,
      "invalid-destination-chain",
      "A supplied destinationChain must contain at least one destination.",
    );
    return;
  }
  if (typeof entry.canonicalPath === "string"
    && entry.destinationChain[0] !== entry.canonicalPath) {
    addError(
      errors,
      entryId,
      "invalid-destination-chain",
      "destinationChain must start with canonicalPath.",
    );
  }
}

function validateRedirect(
  entry: IntegrationManifestEntry,
  destinations: RouteParityDestinations,
  errors: RouteParityError[],
  entryId: string,
): void {
  if (entry.disposition !== "redirect") return;
  const configuredDestination = destinations.redirects.get(entry.source);
  if (configuredDestination === undefined || configuredDestination !== entry.canonicalPath) {
    addError(
      errors,
      entryId,
      "invalid-redirect",
      configuredDestination === undefined
        ? `Redirect source ${entry.source} is not configured in next.config.ts.`
        : `Redirect source ${entry.source} targets ${configuredDestination}, not ${entry.canonicalPath}.`,
    );
  }
}

function validateRegisterInterest(
  entry: IntegrationManifestEntry,
  errors: RouteParityError[],
  entryId: string,
): void {
  if (entry.source !== "cta:register-interest") return;
  const expectedOwners = registerInterestOutcomes.map(({owner}) => owner);
  const expectedDestinations = registerInterestOutcomes.map(({destination}) => destination);
  const owners = entry.durableOwners ?? [];
  const chain = entry.destinationChain ?? [];

  if (!sameOrderedValues(owners, expectedOwners)) {
    addError(
      errors,
      entryId,
      "invalid-durable-owner",
      "Register interest owners must be exactly events and cohorts in outcome order.",
    );
  }
  if (!sameOrderedValues(chain, expectedDestinations)) {
    addError(
      errors,
      entryId,
      "invalid-durable-outcome",
      "Register interest outcomes must be exactly the published events and cohorts surfaces.",
    );
  }
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

    validateDestinationChain(entry, errors, entryId);
    validateRedirect(entry, destinations, errors, entryId);

    if (entry.disposition !== "retire"
      && entry.kind !== "asset"
      && typeof entry.canonicalPath === "string") {
      const submittedDestinations = new Set([
        entry.canonicalPath,
        ...(entry.destinationChain ?? []),
      ]);
      for (const destination of submittedDestinations) {
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

    validateRegisterInterest(entry, errors, entryId);

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
