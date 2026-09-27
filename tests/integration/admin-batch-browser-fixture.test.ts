import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {isolatedAuditDatabase} from "./audit-database-fixture";
import {driveAuditBatch,readAuditBatchFacts,seedAuditBatchProfiles} from "../fixtures/audit-batch-fixture";
import {createAdminBatchesRepository,type BatchDatabase} from "@/lib/db/repos/admin-batches";
import {batchPreviewDigest,batchRequestSchema} from "@/lib/admin/batches/types";
let fixture:Awaited<ReturnType<typeof isolatedAuditDatabase>>;
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION!=='1')('browser batch fixture against real transactions',()=>{
 beforeAll(async()=>{fixture=await isolatedAuditDatabase();await fixture.pool.query("INSERT INTO profiles (id,auth_user_id,role,display_name) VALUES ('browser-staff','browser-staff','staff','Synthetic Staff')");},120000);
 afterAll(async()=>{if(fixture)await fixture.close();});
 it('settles eight, retries exactly two with stable keys, and writes one audit per target',async()=>{
  const run=randomUUID(),{ids}=await seedAuditBatchProfiles(fixture.pool,run),db=fixture.database as unknown as BatchDatabase;
  const actor={kind:'staff',profileId:'browser-staff',userId:'browser-staff'} as const;
  const repo=createAdminBatchesRepository(async()=>db);
  const request=batchRequestSchema.parse({operation:'profile_patch',idempotencyKey:run,selection:{mode:'ids',profileIds:ids},payload:{patch:{locale:'zh-HK'},reason:'Synthetic browser fixture'}});
  const {batchId}=await repo.create(actor,request,batchPreviewDigest(request));
  await driveAuditBatch(fixture.pool,db,run,batchId,'prepare');await repo.commit(actor,batchId,(await repo.preview(actor,batchId)).digest);
  expect(await driveAuditBatch(fixture.pool,db,run,batchId,'fail')).toEqual({claimed:10});
  const partial=await readAuditBatchFacts(fixture.pool,run,batchId);expect(partial.changed).toBe(8);
  expect((await repo.preview(actor,batchId)).counters).toMatchObject({succeeded:8,failed:2});
  await repo.retryFailed(actor,batchId);expect(await driveAuditBatch(fixture.pool,db,run,batchId,'recover')).toEqual({claimed:2});
  const final=await readAuditBatchFacts(fixture.pool,run,batchId);expect(final.changed).toBe(10);expect(final.effects).toHaveLength(10);expect(final.effects.every(effect=>effect.n===1)).toBe(true);
  expect(final.items.map(item=>item.effect_key)).toEqual(partial.items.map(item=>item.effect_key));
  expect(final.items.filter(item=>item.attempt_count===1)).toHaveLength(8);expect(final.items.filter(item=>item.attempt_count===2)).toHaveLength(2);
  await expect(repo.retryFailed(actor,batchId)).rejects.toThrow('BATCH_RETRY_UNAVAILABLE');
 },60000);
});
