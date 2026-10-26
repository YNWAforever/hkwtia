import {describe, expect, it, vi} from 'vitest';
import {verifyAcceptanceTarget, withAcceptanceTarget, type AcceptanceConfig, type TargetIdentity} from '@/scripts/acceptance/target';

const identity: TargetIdentity = {
  projectId: 'dark-cake-07139424', branchId: 'br-restless-pond-a11dpkvd', branchName: 'r2-acceptance-20261026',
  parentBranchId: 'br-steep-queen-a1au2vfd', host: 'ep-lively-pond-a1sfsb3e-pooler.ap-southeast-1.aws.neon.tech',
  database: 'neondb', schema: 'public', protected: false, default: false, primary: false, archived: false,
  restrictedActions: [], verifiedAt: '2026-10-26T06:10:00Z', expiresAt: '2026-11-02T06:10:00Z',
};
const url = `postgresql://synthetic:synthetic@${identity.host}/neondb?sslmode=require`;
const environment = {HKWTIA_ACCEPTANCE_SEED: 'true', DATABASE_URL: url, DATABASE_URL_TEST: url,
  HKWTIA_ACCEPTANCE_DATABASE_HOST_ALLOWLIST: identity.host, HKWTIA_ACCEPTANCE_PROJECT_ID: identity.projectId,
  HKWTIA_ACCEPTANCE_BRANCH_ID: identity.branchId, HKWTIA_ACCEPTANCE_BRANCH_NAME: identity.branchName, NODE_ENV: 'test'};
const valid: AcceptanceConfig = {identity, environment, now: new Date('2026-10-26T07:00:00Z')};
const meta = (patch: Partial<TargetIdentity>) => ({...valid, identity: {...identity, ...patch}});
const env = (patch: Record<string, string>) => ({...valid, environment: {...environment, ...patch}});

describe('HKWTIA acceptance target before client construction', () => {
  it('accepts the independently verified DB identity', () => {
    expect(verifyAcceptanceTarget(valid).databaseUrl).toBe(url);
  });
  it('allows required TLS channel binding without allowing arbitrary session options', () => {
    const bound = url + '&channel_binding=require';
    expect(verifyAcceptanceTarget(env({DATABASE_URL: bound, DATABASE_URL_TEST: bound})).databaseUrl).toBe(bound);
  });
  it.each([
    ['duplicate TLS downgrade', env({DATABASE_URL: url + '&sslmode=disable', DATABASE_URL_TEST: url + '&sslmode=disable'})],
    ['session search_path override', env({DATABASE_URL: url + '&options=-csearch_path%3Dprivate', DATABASE_URL_TEST: url + '&options=-csearch_path%3Dprivate'})],
    ['branch environment mismatch', env({HKWTIA_ACCEPTANCE_BRANCH_ID:'br-other'})],
    ['missing identity', {...valid, identity: undefined}],
    ['wrong host', env({DATABASE_URL: 'postgres://wrong.test/neondb', DATABASE_URL_TEST: 'postgres://wrong.test/neondb'})],
    ['production Node', env({NODE_ENV: 'production'})], ['production Vercel', env({VERCEL_ENV: 'production'})],
    ['missing test URL', env({DATABASE_URL_TEST: ''})], ['missing project', env({HKWTIA_ACCEPTANCE_PROJECT_ID: ''})],
    ['Stripe live', env({STRIPE_SECRET_KEY: 'sk_live_synthetic'})],
    ['Stripe restricted live', env({STRIPE_TEST_SECRET_KEY: 'rk_live_synthetic'})],
    ['old allowlist', env({HKWTIA_ACCEPTANCE_DATABASE_HOST_ALLOWLIST: 'ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech'})],
    ['archived', meta({archived: true})], ['default', meta({default: true})], ['primary', meta({primary: true})],
    ['protected', meta({protected: true})], ['production restricted', meta({restrictedActions: ['vercel_production_branch']})],
    ['expired', meta({expiresAt: '2026-10-25T00:00:00Z'})], ['invalid expiry', meta({expiresAt: 'invalid'})],
    ['future metadata', meta({verifiedAt: '2026-10-27T00:00:00Z'})],
    ['endpoint mismatch', meta({host: 'other.test'})], ['wrong schema', meta({schema: 'private'})],
    ['wrong database', meta({database: 'hkwtia'})], ['missing parent', meta({parentBranchId: ''})],
    ['rejected m2-preview production branch', meta({projectId: 'solitary-wave-52860119', branchId: 'br-dark-forest-az0shpz9', archived: true, default: true, primary: true, restrictedActions: ['vercel production branch']})],
    ['root empty do not seed', meta({projectId: 'spring-dew-56006907', branchName: 'root-empty-do-not-seed'})],
  ])('refuses %s with zero DB factories and provider calls', (_name, config) => {
    const dbClientCreates = vi.fn(); const providerCalls = vi.fn();
    expect(() => withAcceptanceTarget(config, () => {dbClientCreates(); providerCalls();})).toThrow(/HKWTIA_ACCEPTANCE_/);
    expect(dbClientCreates).not.toHaveBeenCalled(); expect(providerCalls).not.toHaveBeenCalled();
  });
});
