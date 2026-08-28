import {createHash} from "node:crypto";

import {
  reconciliationDispositions,
  reportedArchiveIdentity,
} from "@/config/wisetech-authoritative-source-inventory";

export type AuthoritativeSourceError = Readonly<{
  code:
    | "contract-mismatch"
    | "identity-collapse"
    | "duplicate-classification"
    | "missing-classification"
    | "missing-group"
    | "unresolved-destination"
    | "duplicate-asset"
    | "malformed-asset"
    | "unpublishable-asset"
    | "invalid-form-reference"
    | "not-frozen";
  reason: string;
}>;

type UnknownRecord = Record<string, unknown>;

const expectedReportedArchiveFingerprint = "140b35532895b728c8e4d73ca56d1d00653b69d57ae8366a5460c61249715c62";

const expectedFingerprints = Object.freeze({
  identity: "e2054bb31977224ad9ccab1d59f122a13e54d426eb95b98aeaf0e3f0cdcfc102",
  locales: "5977857e5ddad59cb252cebcafea43b7a3563098b7778aa6c4d816a7b68c5d41",
  sitemapRoutes: "06e960215298b4dcfc92e2de622e66346a2046007fa4321a6c58753bf2518036",
  dispatcherOnlyRoutes: "3ad964fd28f3b34bbf02113233fc111f4c39b1103edb35421c85c39f10300495",
  navigationTargets: "9f023ef38743a53bac7134dd49bd39cc75eee970df6120131bdc845b1d93d94f",
  forms: "2d6170f4f8df1dcb7f20c223f8de52b41123eb64b6361dd42d25cd8ac370ce99",
  formFlows: "51486e568c916a9320f544420d8bb73cad73f06508f333bcf6982a7a62717b24",
  sourceArtifacts: "4e4cff89b3ff0f51843e371ddb752a8515018324b49cd59acd81f78360217d29",
  componentGroups: "4537b37dd90e7158cdb7f528d2a0a297f4787c883709b8626a01f6644a9e412c",
  content: "844b6c938731eb0afb64a4ca5f4fbf7f58cf46a004668dce7697b2eef1c6240c",
  assets: "b3f512993bfb3042d5928a4852e2f99694658ec9eb33655c6126d2e6bc26c325",
});

const requiredGroups = Object.freeze(Object.keys(expectedFingerprints) as (keyof typeof expectedFingerprints)[]);
const assetCategories = Object.freeze([
  "archive-image",
  "brand-asset",
  "editorial-image",
  "historical-partner-logo",
  "root-asset",
]);
const evidenceStatuses = Object.freeze(["unreviewed", "approved"]);

function add(
  errors: AuthoritativeSourceError[],
  code: AuthoritativeSourceError["code"],
  reason: string,
): void {
  errors.push({code, reason});
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? String(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  const record = value as UnknownRecord;
  return "{" + Object.keys(record)
    .sort()
    .map((key) => JSON.stringify(key) + ":" + canonicalize(record[key]))
    .join(",") + "}";
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

function isDeeplyFrozen(value: unknown): boolean {
  if (!isRecord(value) && !Array.isArray(value)) return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every(isDeeplyFrozen);
}

function supportedDisposition(value: unknown): boolean {
  return typeof value === "string" &&
    reconciliationDispositions.includes(value as (typeof reconciliationDispositions)[number]);
}

function validateExactGroups(value: UnknownRecord, errors: AuthoritativeSourceError[]): void {
  for (const group of requiredGroups) {
    if (!(group in value)) {
      add(errors, "missing-group", `Required inventory group ${group} is missing.`);
      continue;
    }
    if (fingerprint(value[group]) !== expectedFingerprints[group]) {
      add(errors, "contract-mismatch", `Inventory group ${group} differs from the frozen authoritative contract.`);
    }
  }
}

function validateClassifiedRows(
  groupName: string,
  value: unknown,
  destinations: ReadonlySet<string>,
  errors: AuthoritativeSourceError[],
  options: Readonly<{requireDestination: boolean; identityField: string}>,
): UnknownRecord[] {
  if (!Array.isArray(value)) return [];
  const rows: UnknownRecord[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (!isRecord(candidate)) {
      add(errors, "missing-classification", `${groupName} contains a non-object row.`);
      continue;
    }
    rows.push(candidate);
    const identity = candidate[options.identityField];
    if (typeof identity !== "string" || identity.length === 0 || !supportedDisposition(candidate.disposition)) {
      add(errors, "missing-classification", `${groupName} rows require an identity and one supported disposition.`);
      continue;
    }
    if (seen.has(identity)) {
      add(errors, "duplicate-classification", `Duplicate ${groupName} identity ${identity}.`);
    }
    seen.add(identity);
    if (options.requireDestination && candidate.disposition !== "retire") {
      if (typeof candidate.canonicalPath !== "string" || !destinations.has(candidate.canonicalPath)) {
        add(errors, "unresolved-destination", `Destination for ${identity} is not resolvable.`);
      }
    } else if (options.requireDestination && candidate.disposition === "retire" && candidate.canonicalPath !== null) {
      add(errors, "unresolved-destination", `Retired row ${identity} must not claim a canonical destination.`);
    }
  }
  return rows;
}

function validateRouteUniqueness(
  sitemapRows: readonly UnknownRecord[],
  dispatcherRows: readonly UnknownRecord[],
  errors: AuthoritativeSourceError[],
): void {
  const seen = new Set<string>();
  for (const row of [...sitemapRows, ...dispatcherRows]) {
    if (typeof row.sourcePath !== "string") continue;
    if (seen.has(row.sourcePath)) {
      add(errors, "duplicate-classification", `Route ${row.sourcePath} is classified more than once across route groups.`);
    }
    seen.add(row.sourcePath);
  }
}

function validateFormReferences(
  forms: readonly UnknownRecord[],
  flows: readonly UnknownRecord[],
  errors: AuthoritativeSourceError[],
): void {
  const formIds = new Set(forms.flatMap((form) => typeof form.id === "string" ? [form.id] : []));
  const referenced = new Set<string>();
  for (const flow of flows) {
    if (typeof flow.formId !== "string" || !formIds.has(flow.formId)) {
      add(errors, "invalid-form-reference", "Every logical form flow must reference one physical form.");
      continue;
    }
    referenced.add(flow.formId);
  }
  for (const formId of formIds) {
    if (!referenced.has(formId)) {
      add(errors, "invalid-form-reference", `Physical form ${formId} has no classified logical flow.`);
    }
  }
}

function validateAssets(value: unknown, errors: AuthoritativeSourceError[]): void {
  if (!Array.isArray(value)) return;
  const paths = new Set<string>();
  const categoryCounts = new Map<string, number>();
  for (const candidate of value) {
    if (!isRecord(candidate)) {
      add(errors, "malformed-asset", "Every asset must be an evidence object.");
      continue;
    }
    const {
      sourcePath,
      sha256,
      category,
      disposition,
      rightsStatus,
      relationshipStatus,
      englishAltStatus,
      traditionalChineseAltStatus,
      publishable,
    } = candidate;
    const valid =
      typeof sourcePath === "string" &&
      /^[a-f0-9]{64}$/.test(typeof sha256 === "string" ? sha256 : "") &&
      typeof category === "string" &&
      assetCategories.includes(category) &&
      supportedDisposition(disposition) &&
      typeof rightsStatus === "string" &&
      evidenceStatuses.includes(rightsStatus) &&
      typeof relationshipStatus === "string" &&
      evidenceStatuses.includes(relationshipStatus) &&
      typeof englishAltStatus === "string" &&
      evidenceStatuses.includes(englishAltStatus) &&
      typeof traditionalChineseAltStatus === "string" &&
      evidenceStatuses.includes(traditionalChineseAltStatus) &&
      typeof publishable === "boolean";
    if (!valid) {
      add(errors, "malformed-asset", "Every asset requires a valid path, SHA-256, category, disposition, evidence statuses, and publication flag.");
    }
    if (typeof sourcePath === "string") {
      if (paths.has(sourcePath)) {
        add(errors, "duplicate-asset", `Duplicate asset evidence ${sourcePath}.`);
      }
      paths.add(sourcePath);
    }
    if (typeof category === "string") {
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }
    if (publishable === true && (
      rightsStatus !== "approved" ||
      relationshipStatus !== "approved" ||
      englishAltStatus !== "approved" ||
      traditionalChineseAltStatus !== "approved"
    )) {
      add(errors, "unpublishable-asset", "A donor asset needs rights, relationship, and bilingual-alt approval before publication.");
    }
    if (category === "historical-partner-logo" && publishable !== false) {
      add(errors, "unpublishable-asset", "Historical partner logos are evidence only and cannot assert a current publishable relationship.");
    }
  }
  const exactCategoryCounts: Readonly<Record<string, number>> = {
    "archive-image": 6,
    "brand-asset": 2,
    "editorial-image": 5,
    "historical-partner-logo": 79,
    "root-asset": 7,
  };
  for (const [category, count] of Object.entries(exactCategoryCounts)) {
    if (categoryCounts.get(category) !== count) {
      add(errors, "contract-mismatch", `Asset category ${category} must contain exactly ${count} rows.`);
    }
  }
}

export function validateAuthoritativeSourceInventory(
  inventory: unknown,
  destinations: ReadonlySet<string>,
): readonly AuthoritativeSourceError[] {
  const errors: AuthoritativeSourceError[] = [];
  if (!isRecord(inventory)) {
    add(errors, "missing-group", "Inventory must be an object.");
    return errors;
  }

  validateExactGroups(inventory, errors);
  if (fingerprint(reportedArchiveIdentity) !== expectedReportedArchiveFingerprint) {
    add(errors, "contract-mismatch", "The separate reported archive identity differs from the frozen historical contract.");
  }

  const identity = isRecord(inventory.identity) ? inventory.identity : {};
  if (
    identity.commit === reportedArchiveIdentity.commit ||
    identity.tree === reportedArchiveIdentity.archiveSha256 ||
    identity.treeListingSha256 === reportedArchiveIdentity.archiveSha256
  ) {
    add(errors, "identity-collapse", "Git donor identity must remain distinct from the reported archive identity.");
  }

  const sitemapRows = validateClassifiedRows(
    "sitemapRoutes",
    inventory.sitemapRoutes,
    destinations,
    errors,
    {requireDestination: true, identityField: "sourcePath"},
  );
  const dispatcherRows = validateClassifiedRows(
    "dispatcherOnlyRoutes",
    inventory.dispatcherOnlyRoutes,
    destinations,
    errors,
    {requireDestination: true, identityField: "sourcePath"},
  );
  validateRouteUniqueness(sitemapRows, dispatcherRows, errors);
  validateClassifiedRows(
    "navigationTargets",
    inventory.navigationTargets,
    destinations,
    errors,
    {requireDestination: true, identityField: "sourcePath"},
  );
  const forms = validateClassifiedRows(
    "forms",
    inventory.forms,
    destinations,
    errors,
    {requireDestination: true, identityField: "id"},
  );
  const formFlows = validateClassifiedRows(
    "formFlows",
    inventory.formFlows,
    destinations,
    errors,
    {requireDestination: true, identityField: "id"},
  );
  validateClassifiedRows(
    "sourceArtifacts",
    inventory.sourceArtifacts,
    destinations,
    errors,
    {requireDestination: false, identityField: "sourceFile"},
  );
  validateClassifiedRows(
    "componentGroups",
    inventory.componentGroups,
    destinations,
    errors,
    {requireDestination: false, identityField: "sourceFile"},
  );
  validateFormReferences(forms, formFlows, errors);
  validateAssets(inventory.assets, errors);

  if (!isDeeplyFrozen(inventory)) {
    add(errors, "not-frozen", "The checked-in authoritative inventory must be deeply frozen.");
  }

  return errors;
}
