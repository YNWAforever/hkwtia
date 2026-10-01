// @vitest-environment node
import {randomUUID} from 'node:crypto';
import {drizzle} from 'drizzle-orm/node-postgres';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {assertIsolatedSeedEnvironment,assertSeedSentinel} from '@/scripts/lib/acceptance-guard';
import {createProfileIdentityRepository} from '@/lib/db/repos/profile-identities';
import type {Database} from '@/lib/db/repos/common';
const run=randomUUID();
const ids=Array.from({length:6},()=>randomUUID());
let pool:Pool;
let repository:ReturnType<typeof createProfileIdentityRepository>;
describe.skipIf(process.env.FULL_REMEDIATION_ACCEPTANCE_SEED!=='true')('real isolated identity provision boundary',()=>{
 beforeAll(async()=>{
  const url=assertIsolatedSeedEnvironment(process.env,{prefix:'FULL_REMEDIATION',flag:'FULL_REMEDIATION_ACCEPTANCE_SEED',hostAllowlistVar:'FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST'});
  if(new URL(url).hostname!=='ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech'||process.env.NEON_PROJECT_ID!=='solitary-wave-52860119')throw Error('UNCONFIRMED_ISOLATED_TARGET');
  pool=new Pool({connectionString:url});
  await assertSeedSentinel('FULL_REMEDIATION',async()=>Number((await pool.query('SELECT count(*) AS count FROM acceptance_sentinel')).rows[0].count));
  // The real production repository executes PostgreSQL; only the transport is supplied.
  repository=createProfileIdentityRepository(async()=>drizzle(pool) as unknown as Database);
 });
 afterAll(async()=>{if(pool){await pool.query('DELETE FROM profiles WHERE id=ANY($1::text[])',[ids]);await pool.end();}});
 it('creates only a member profile and a repeated verified identity creates no entitlement',async()=>{
  const input={authUserId:ids[0],email:'fr-auth-'+run+'@example.test',displayName:'Synthetic identity'};
  const results=await Promise.all([repository.provisionMember(input),repository.provisionMember(input)]);
  expect(results).toEqual([{kind:'ready',identity:{profileId:ids[0],role:'member'}},{kind:'ready',identity:{profileId:ids[0],role:'member'}}]);
  expect((await pool.query('SELECT count(*)::int AS n FROM profiles WHERE auth_user_id=$1',[ids[0]])).rows[0].n).toBe(1);
  expect((await pool.query('SELECT count(*)::int AS n FROM memberships WHERE owner_user_id=$1',[ids[0]])).rows[0].n).toBe(0);
 },30_000);
 it('never links a new verified subject to an existing privileged profile by email',async()=>{
  const email='fr-collision-'+run+'@example.test';
  await pool.query('INSERT INTO profiles(id,auth_user_id,email,display_name,role) VALUES($1,$1,$2,$3,$4)',[ids[1],email,'Synthetic staff','staff']);
  expect(await repository.provisionMember({authUserId:ids[2],email:email.toUpperCase(),displayName:'Other subject'})).toEqual({kind:'conflict'});
  expect(await repository.resolve(ids[2])).toBeNull();
  expect(await repository.resolve(ids[1])).toEqual({profileId:ids[1],role:'staff'});
 },30_000);
 it('serializes two different subjects claiming one address without duplicate identities',async()=>{
  const email='fr-race-'+run+'@example.test';
  const results=await Promise.all(ids.slice(3,5).map(authUserId=>repository.provisionMember({authUserId,email,displayName:'Synthetic race'})));
  expect(results.filter(value=>value.kind==='ready')).toHaveLength(1);
  expect(results.filter(value=>value.kind==='conflict')).toHaveLength(1);
  expect((await pool.query('SELECT role FROM profiles WHERE lower(email)=$1',[email])).rows).toEqual([{role:'member'}]);
 },30_000);
});
