import identity from '@/scripts/acceptance/target-identity.json';
import {verifyAcceptanceTarget} from '@/scripts/acceptance/target';

/** Historical callers now share the current target gate; old project names cannot authorize writes. */
export function finalAuditIsolatedDatabaseUrl(): string | null {
  if (process.env.AUDIT_ISOLATED_ACCEPTANCE !== '1') return null;
  try {
    return verifyAcceptanceTarget({identity, environment: process.env}).databaseUrl;
  } catch { return null; }
}
