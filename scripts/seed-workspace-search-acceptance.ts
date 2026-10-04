import "server-only";
import {randomUUID} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import assert from "node:assert/strict";
import {Pool} from "pg";
import {assertIsolatedSeedEnvironment,assertSeedSentinel} from "./lib/acceptance-guard";
async function main() {
  const deployment=JSON.parse(readFileSync(".playwright/full-fix-t18-preview-deployment-safe.json","utf8"));
  const runtime=JSON.parse(readFileSync(".playwright/full-fix-t18-preview-runtime-safe.json","utf8"));
  const binding=JSON.parse(readFileSync(".playwright/full-fix-t18-staff-binding-private.json","utf8"));
  assert.equal(deployment.target,null);assert.equal(deployment.gitRef,"codex/administrative-workspace-20261003");
  assert.equal(deployment.origin,"https://hkwtia-admin-workspace-20261003.vercel.app");assert.equal(runtime.sourceSha,deployment.sourceSha);assert.equal(binding.sourceSha,deployment.sourceSha);assert.equal(binding.origin,deployment.origin);
  assert(runtime.checks.some((c:{dbSourcePositivelyProven?:boolean})=>c.dbSourcePositivelyProven));
  const url=assertIsolatedSeedEnvironment(process.env,{prefix:"FULL_REMEDIATION",flag:"FULL_REMEDIATION_ACCEPTANCE_SEED",hostAllowlistVar:"FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST"});
  assert.equal(new URL(url).hostname,"ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech");assert.equal(process.env.NEON_PROJECT_ID,"solitary-wave-52860119");
  const pool=new Pool({connectionString:url,query_timeout:15000});
  try {
    await assertSeedSentinel("FULL_REMEDIATION",async()=>Number((await pool.query("SELECT count(*) AS n FROM acceptance_sentinel")).rows[0].n));
    const proof=(await pool.query("SELECT role FROM profiles WHERE id=$1 AND auth_user_id=$2",[binding.profileId,binding.userId])).rows;assert.deepEqual(proof,[{role:"staff"}]);
    const run=randomUUID(),label="Synthetic T18 "+run,profileId="t18ws-"+run,companyId=randomUUID(),applicationId=randomUUID(),eventId=randomUUID(),conversationId=randomUUID();
    const queries=[51,101].map(count=>({count,query:"Synthetic T18 "+run+" set"+count}));
    await pool.query("BEGIN");
    try {
      await pool.query("INSERT INTO profiles(id,auth_user_id,email,display_name,role) VALUES($1,$1,$2,$3,'member')",[profileId,profileId+"@example.test",label]);
      await pool.query("INSERT INTO companies(id,legal_name,display_name,directory_visible) VALUES($1,$2,$2,false)",[companyId,label]);
      await pool.query("INSERT INTO membership_applications(id,applicant_user_id,company_id,plan_code,status) VALUES($1,$2,$3,'corporate','draft')",[applicationId,profileId,companyId]);
      await pool.query("INSERT INTO events(id,slug,title_en,title_zh,description_en,starts_at,published,status) VALUES($1,$2,$3,$3,'Synthetic acceptance only',now()+interval '30 days',false,'draft')",[eventId,"synthetic-t18-"+run,label]);
      await pool.query("INSERT INTO conversations(id,profile_id,handling,expires_at) VALUES($1,$2,'human',now()+interval '1 day')",[conversationId,profileId]);
      for(const set of queries) await pool.query("INSERT INTO profiles(id,auth_user_id,email,display_name,role) SELECT $1||'-'||lpad(n::text,3,'0'),$1||'-'||lpad(n::text,3,'0'),$1||'-'||lpad(n::text,3,'0')||'@example.test',$2,'member' FROM generate_series(1,$3) n",["t18ws-"+run+"-set"+set.count,set.query,set.count]);
      await pool.query("COMMIT");
    }catch(error){await pool.query("ROLLBACK");throw error;}
    writeFileSync(".playwright/full-fix-t18-fixtures-private.json",JSON.stringify({sourceSha:deployment.sourceSha,origin:deployment.origin,run,label,profileId,companyId,applicationId,eventId,conversationId,queries}),{mode:0o600});
    const receipt={sourceSha:deployment.sourceSha,origin:deployment.origin,syntheticProfiles:153,syntheticCompany:1,syntheticApplication:1,syntheticDraftEvent:1,syntheticConversation:1,messages:0,memberships:0,payments:0,providers:0,production:false};
    writeFileSync(".playwright/full-fix-t18-fixtures-safe.json",JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
  }finally{await pool.end();}
}
main().catch(()=>{console.error("ISOLATED_WORKSPACE_FIXTURE_FAILED");process.exitCode=1;});
