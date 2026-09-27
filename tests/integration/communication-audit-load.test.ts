import {mkdirSync,writeFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {performance} from "node:perf_hooks";
import {drizzle} from "drizzle-orm/node-postgres";
import {describe,expect,it,vi} from "vitest";
import {isolatedAuditDatabase} from "./audit-database-fixture";
import {communicationBatchHandler} from "@/lib/db/repos/batch-handlers/communication";
import {batchRequestSchema} from "@/lib/admin/batches/types";
const enabled=process.env.RUN_POSTGRES_INTEGRATION==="1"&&process.env.RUN_AUDIT_LOAD==="1";
describe.skipIf(!enabled)("bounded communication preview capacity",()=>{
  it("prepares 5000 consented synthetic profiles with a bounded number of statements and no campaigns or sends",async()=>{
    vi.stubEnv("MEMBER_COMMUNICATION_BATCH_ENABLED","true");
    const fixture=await isolatedAuditDatabase();
    try {
      await fixture.pool.query("INSERT INTO profiles(id,auth_user_id,display_name,role) VALUES ('staff','staff','Synthetic Staff','staff')");
      await fixture.pool.query("INSERT INTO profiles(id,auth_user_id,display_name,email,consent_marketing) SELECT 'load-'||i,'auth-'||i,'Synthetic '||i,'load-'||i||'@example.test',true FROM generate_series(1,5000) i");
      await fixture.pool.query("INSERT INTO memberships(owner_user_id,plan_code,status,seat_limit) SELECT id,'community','active',1 FROM profiles WHERE role='member'");
      const segmentId=randomUUID();
      await fixture.pool.query("INSERT INTO saved_segments(id,owner_profile_id,name_en,filter_version,filters) VALUES ($1,'staff','Synthetic capacity',2,'{}')",[segmentId]);
      let queries=0;
      const database=drizzle(fixture.pool,{logger:{logQuery(){queries++;}}});
      const request=batchRequestSchema.parse({operation:"profile_update_invite",idempotencyKey:randomUUID(),selection:{mode:"ids",profileIds:Array.from({length:5000},(_,i)=>`load-${i+1}`)},payload:{channel:"email",segmentId}});
      const start=performance.now();
      const preview=await database.transaction(tx=>communicationBatchHandler.prepare({kind:"staff",userId:"staff",profileId:"staff"},request,tx));
      const elapsedMs=performance.now()-start;
      expect(preview).toHaveLength(5000);expect(preview.every(row=>row.eligible)).toBe(true);
      expect(queries).toBeLessThanOrEqual(8);
      expect((await fixture.pool.query("SELECT count(*)::int n FROM campaigns")).rows[0].n).toBe(0);
      mkdirSync("docs/audits/hkwtia-2026-09-26/evidence",{recursive:true});
      writeFileSync("docs/audits/hkwtia-2026-09-26/evidence/communication-load.json",JSON.stringify({revision:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),generatedAt:new Date().toISOString(),node:process.version,platform:process.platform,database:"disposable pgvector/pgvector:pg16",syntheticOnly:true,rows:preview.length,eligible:preview.filter(row=>row.eligible).length,queries,elapsedMs,campaignsCreated:0,completed:true},null,2)+"\n");
    } finally {await fixture.close();vi.unstubAllEnvs();}
  },180_000);
});
