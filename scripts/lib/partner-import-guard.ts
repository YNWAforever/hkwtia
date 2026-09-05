/**
 * Authorization for scripts/import-wisetech-partners.ts.
 *
 * This is deliberately NOT scripts/lib/acceptance-guard.ts's
 * assertIsolatedSeedEnvironment: that helper hard-forbids production, but this
 * script is explicitly meant to be runnable against production once the owner
 * has confirmed partner rights -- production is a second, explicit path here,
 * not a forbidden one.
 */

const actorKinds = ["staff", "exco", "superadmin"] as const;
export type PartnerImportActorKind = (typeof actorKinds)[number];

export type PartnerImportAuthorization = Readonly<{
  actorProfileId: string;
  actorKind: PartnerImportActorKind;
}>;

type Environment = Readonly<Record<string, string | undefined>>;

function normalized(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function isActorKind(value: string): value is PartnerImportActorKind {
  return (actorKinds as readonly string[]).includes(value);
}

/**
 * Distinct from scripts/lib/acceptance-guard.ts's assertSeedSentinel: that
 * helper always fails when the count isn't exactly 1. Here, "not exactly 1"
 * is not fatal by itself -- it just means the caller must also supply the
 * explicit production override. An unreadable table stays fatal either way,
 * because we cannot safely reason about a database we cannot query.
 */
async function sentinelConfirmsDisposable(countSentinelRows: () => Promise<number>): Promise<boolean> {
  let rows: number;
  try {
    rows = await countSentinelRows();
  } catch (error) {
    throw new Error("PARTNER_IMPORT_SENTINEL_CHECK_FAILED", {cause: error});
  }
  return rows === 1;
}

export async function assertPartnerImportAuthorized(
  environment: Environment,
  countSentinelRows: () => Promise<number>,
): Promise<PartnerImportAuthorization> {
  const fail = (code: string): never => {
    throw new Error(code);
  };

  if (normalized(environment.WISETECH_PARTNER_IMPORT) !== "true") fail("PARTNER_IMPORT_NOT_AUTHORIZED");

  const actorProfileIdRaw = environment.WISETECH_IMPORT_ACTOR_PROFILE_ID?.trim();
  if (!actorProfileIdRaw) fail("PARTNER_IMPORT_ACTOR_REQUIRED");

  const rawActorKind = environment.WISETECH_IMPORT_ACTOR_KIND?.trim();
  const actorKind: PartnerImportActorKind = rawActorKind === undefined || rawActorKind === ""
    ? "staff"
    : (isActorKind(rawActorKind) ? rawActorKind : fail("PARTNER_IMPORT_ACTOR_KIND_INVALID"));

  const disposable = await sentinelConfirmsDisposable(countSentinelRows);
  if (!disposable && normalized(environment.WISETECH_IMPORT_ALLOW_PRODUCTION) !== "true") {
    fail("PARTNER_IMPORT_PRODUCTION_NOT_CONFIRMED");
  }

  return {actorProfileId: actorProfileIdRaw as string, actorKind};
}
