import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {z} from "zod";
import {assertIsolatedSeedEnvironment,assertSeedSentinel} from "./acceptance-guard";
import {createAiDraftsRepository} from "../../lib/db/repos/ai-drafts";
import {supportCaseId} from "../../lib/ai/drafts/support-facts";
import {claimsForGroundedTemplate} from "../../lib/ai/drafts/validation";
const id=z.string().uuid().parse(process.argv[2]);
const url=assertIsolatedSeedEnvironment(process.env,{prefix:"FULL_REMEDIATION",flag:"FULL_REMEDIATION_ACCEPTANCE_SEED",hostAllowlistVar:"FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST"});
assert.equal(new URL(url).hostname,"ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech");
assert.equal(url,process.env.DATABASE_URL_TEST);
const pool=new Pool({connectionString:url,query_timeout:15000});
try{
 await assertSeedSentinel("FULL_REMEDIATION",async()=>Number((await pool.query("SELECT count(*) AS n FROM acceptance_sentinel")).rows[0].n));
 assert.equal(Number((await pool.query("SELECT count(*) AS n FROM drizzle.__drizzle_migrations")).rows[0].n),59);
 assert.equal(Number((await pool.query("SELECT count(*) AS n FROM profiles WHERE email IS NOT NULL AND email NOT LIKE '%example.test'")).rows[0].n),0);
 assert.equal((await pool.query("SELECT id FROM conversations WHERE id=$1 AND profile_id LIKE 't10-native-%' AND agent_kind='concierge'",[id])).rows.length,1);
 const profile=(await pool.query("SELECT id,auth_user_id FROM profiles WHERE role='staff' AND auth_user_id=$1",[z.string().min(1).max(255).parse(process.argv[3])])).rows;
 assert.equal(profile.length,1);const actor={kind:'staff' as const,profileId:profile[0].id,userId:profile[0].auth_user_id},repo=createAiDraftsRepository(async()=>drizzle(pool) as never);
 const facts=await repo.getFacts(actor,{kind:'support',caseId:supportCaseId(id)}),run=randomUUID();
 await pool.query("INSERT INTO agent_runs(id,agent,trigger,profile_id) VALUES($1,'board_reporter','scheduled',$2)",[run,actor.profileId]);
 const body='Please ask the assigned staff member to check this request.';
 const draft=await repo.saveProposedDraft(actor,{kind:'support',caseId:supportCaseId(id),body,claims:claimsForGroundedTemplate(body,facts),sourceRefs:facts.sourceRefs,ownerId:actor.profileId,dueAt:null,modelRoute:'synthetic-offline-fixture',promptVersion:'t10-native-offline',runId:run,expectedFactsHash:facts.versionHash,analysis:{summary:'The member asks for assistance.',category:'billing',tasks:['Review this request manually.']}});
 console.log(JSON.stringify({draftId:draft.id,version:draft.version,state:draft.state,syntheticOfflineFixture:true,externalModelCalls:0}));
}finally{await pool.end();}
