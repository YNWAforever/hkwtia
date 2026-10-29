import {assertIsolatedSeedEnvironment} from '../lib/acceptance-guard.ts';

export type TargetIdentity = Readonly<{
  projectId: string; branchId: string; branchName: string; parentBranchId: string;
  host: string; database: string; schema: string;
  protected: boolean; default: boolean; primary: boolean; archived: boolean;
  restrictedActions: readonly string[]; verifiedAt: string; expiresAt: string;
}>;
export type AcceptanceConfig = Readonly<{
  environment: Readonly<Record<string, string | undefined>>;
  identity?: TargetIdentity; now?: Date;
}>;
export type VerifiedTarget = Readonly<{databaseUrl: string; identity: TargetIdentity}>;

const verified = new WeakSet<object>();
export function verifyAcceptanceTarget(config: AcceptanceConfig): VerifiedTarget {
  const fail = (): never => { throw Error('HKWTIA_ACCEPTANCE_TARGET_REFUSED'); };
  const e = config.environment;
  const databaseUrl = assertIsolatedSeedEnvironment(e, {
    prefix: 'HKWTIA_ACCEPTANCE', flag: 'HKWTIA_ACCEPTANCE_SEED',
    hostAllowlistVar: 'HKWTIA_ACCEPTANCE_DATABASE_HOST_ALLOWLIST',
  });
  const i = config.identity;
  if (!i) return fail();
  const now = (config.now ?? new Date()).getTime();
  const from = Date.parse(i.verifiedAt), until = Date.parse(i.expiresAt);
  if (!Number.isFinite(from) || !Number.isFinite(until) || from > now || until <= now
    || until <= from || until - from > 7 * 86400000) fail();
  if (i.projectId !== 'dark-cake-07139424' || i.branchId !== 'br-restless-pond-a11dpkvd'
    || i.branchName !== 'r2-acceptance-20261026' || i.parentBranchId !== 'br-steep-queen-a1au2vfd'
    || i.host !== 'ep-lively-pond-a1sfsb3e-pooler.ap-southeast-1.aws.neon.tech'
    || i.database !== 'neondb' || i.schema !== 'public'
    || i.protected !== false || i.default !== false || i.primary !== false || i.archived !== false
    || !Array.isArray(i.restrictedActions) || i.restrictedActions.length !== 0) fail();
  if (e.HKWTIA_ACCEPTANCE_PROJECT_ID !== i.projectId || e.HKWTIA_ACCEPTANCE_BRANCH_ID !== i.branchId
    || e.HKWTIA_ACCEPTANCE_BRANCH_NAME !== i.branchName) fail();
  const url = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== i.host
    || url.pathname !== '/' + i.database || url.searchParams.get('sslmode') !== 'require'
    || [...url.searchParams.keys()].some(key => !['sslmode', 'channel_binding'].includes(key) || url.searchParams.getAll(key).length !== 1)
    || (url.searchParams.has('channel_binding') && url.searchParams.get('channel_binding') !== 'require')) fail();
  if (Object.entries(e).some(([key, value]) => /stripe/i.test(key) && /(?:sk|rk|pk)_live_/i.test(value ?? ''))) fail();
  const target = Object.freeze({databaseUrl, identity: Object.freeze({...i, restrictedActions: Object.freeze([...i.restrictedActions])})});
  verified.add(target);
  return target;
}

/** Reject structural casts or expired handles before opening a connection. */
export function assertVerifiedTarget(target: VerifiedTarget): void {
  if (!verified.has(target) || Date.parse(target.identity.expiresAt) <= Date.now()) {
    throw Error('HKWTIA_ACCEPTANCE_VERIFIED_TARGET_REQUIRED');
  }
}

/** No client factory may run until the pure target gate returns. */
export function withAcceptanceTarget<T>(config: AcceptanceConfig, factory: (target: VerifiedTarget) => T): T {
  return factory(verifyAcceptanceTarget(config));
}
