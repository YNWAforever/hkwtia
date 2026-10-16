// @vitest-environment node
import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {isolatedBatchDatabase} from './admin-batch-fixture';
import {grantMembership} from '@/lib/db/repos/membership-grants';
const actor={kind:'superadmin',userId:'root',profileId:'root'} as const;
let fixture:Awaited<ReturnType<typeof isolatedBatchDatabase>>;
const input={target:{kind:'profile',profileId:'grant-d'},planCode:'corporate',effectiveAt:'2040-10-01T00:00:00.000Z',expiresAt:'2041-11-01T00:00:00.000Z',reason:'Approved synthetic scholarship'};
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION!=='1')('manual grant retry on disposable PostgreSQL',()=>{
 beforeAll(async()=>{fixture=await isolatedBatchDatabase();},60_000);
 afterAll(async()=>{if(fixture)await fixture.close();},40_000);
 it('returns one durable result and audit for parallel requests with the same key',async()=>{
  const options={enabled:true,requestKey:randomUUID(),loadDatabase:async()=>fixture.database};
  const attempts=await Promise.allSettled([grantMembership(actor,input,options),grantMembership(actor,input,options)]);
  expect(attempts.filter(value=>value.status==='fulfilled')).toHaveLength(2);
  const results=attempts.flatMap(value=>value.status==='fulfilled'?[value.value]:[]);
  expect(new Set(results).size).toBe(1);
  expect((await fixture.pool.query("SELECT count(*)::int AS n FROM memberships WHERE owner_user_id='grant-d'")).rows[0].n).toBe(1);
  expect((await fixture.pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='membership.grant.created' AND target_id=$1",[results[0]])).rows[0].n).toBe(1);
  await expect(grantMembership(actor,{...input,reason:'Different approved decision'},options)).rejects.toThrow('GRANT_REQUEST_CONFLICT');
  await fixture.pool.query("UPDATE memberships SET status='expired' WHERE id=$1",[results[0]]);
  expect(await grantMembership(actor,input,options)).toBe(results[0]);
  expect((await fixture.pool.query("SELECT status FROM memberships WHERE owner_user_id='grant-d'")).rows).toEqual([{status:'expired'}]);
 },60_000);
 it('preserves legacy indefinite rows byte for byte across new reasoned grants',async()=>{
  const before=(await fixture.pool.query("SELECT row_to_json(m) AS row FROM memberships m WHERE owner_user_id='a'")).rows;
  const options={enabled:true,requestKey:randomUUID(),loadDatabase:async()=>fixture.database};
  await grantMembership(actor,{...input,target:{kind:'profile',profileId:'grant-c'}},options);
  expect((await fixture.pool.query("SELECT row_to_json(m) AS row FROM memberships m WHERE owner_user_id='a'")).rows).toEqual(before);
  const created=(await fixture.pool.query("SELECT grant_reason,grant_effective_at,grant_expires_at,stripe_subscription_id FROM memberships WHERE owner_user_id='grant-c'")).rows[0];
  expect(created.grant_reason).toBe(input.reason);expect(created.grant_effective_at).toEqual(new Date(input.effectiveAt));expect(created.grant_expires_at).toEqual(new Date(input.expiresAt));expect(created.stripe_subscription_id).toBeNull();
 },30_000);
});
