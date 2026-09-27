/** The final-audit browser tests may mutate only this short-lived Neon acceptance branch. */
export function finalAuditIsolatedDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL_TEST;
  const expectedHost = process.env.M2_TEST_NEON_HOST?.replace("-pooler", "");
  if (process.env.AUDIT_ISOLATED_ACCEPTANCE !== "1"
    || process.env.NEON_PROJECT_ID !== "solitary-wave-52860119"
    || process.env.M2_TEST_NEON_PROJECT_ID !== "solitary-wave-52860119"
    || !url || url !== process.env.DATABASE_URL || !expectedHost
    || new URL(url).hostname.replace("-pooler", "") !== expectedHost) return null;
  return url;
}
