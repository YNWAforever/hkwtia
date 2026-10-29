export type MembershipImportWriteMode = "off" | "on" | "production_forbidden";

type Environment = Readonly<Record<string, string | undefined>>;

function normalized(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

/**
 * Membership import is a staging load. Vercel preview sets NODE_ENV=production
 * and VERCEL_ENV=preview; that process is the staging target. VERCEL_ENV=production
 * is refused, and so is a production Node process that is not an explicit Vercel
 * preview or development deployment — the same split as business-registration
 * storage, so a production boot cannot look like a local rehearsal.
 */
export function isMembershipImportProduction(environment: Environment): boolean {
  const vercel = normalized(environment.VERCEL_ENV);
  if (vercel === "production") return true;
  const node = normalized(environment.NODE_ENV);
  return node === "production" && vercel !== "preview" && vercel !== "development";
}

/** Both flags are required. Production refuses even when both are set. */
export function membershipImportWriteMode(environment: Environment = process.env): MembershipImportWriteMode {
  if (environment.MEMBER_IMPORT_ENABLED !== "true") return "off";
  if (environment.MEMBER_IMPORT_MEMBERSHIP_WRITE_ENABLED !== "true") return "off";
  if (isMembershipImportProduction(environment)) return "production_forbidden";
  return "on";
}
