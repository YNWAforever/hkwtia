// @vitest-environment node
import {randomUUID} from 'node:crypto';
import {drizzle} from 'drizzle-orm/node-postgres';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {assertIsolatedSeedEnvironment,assertSeedSentinel} from '@/scripts/lib/acceptance-guard';
import {automationCronActor} from '@/lib/auth/automation-actor';
import type {AutomationDatabase} from '@/lib/db/repos/journeys';
import {parseSegmentFilter} from '@/lib/admin/segment-schema';
import {classifyRecipient} from '@/lib/admin/campaign-eligibility';
import {createMessageEligibilityRepository} from '@/lib/db/repos/message-eligibility';
import {notificationActor} from '@/lib/db/repos/deliveries';
import {queueCampaign} from '@/lib/admin/campaigns';
import {createCampaignDraft} from '@/lib/admin/campaign-wizard';
import {createCampaignsRepository} from '@/lib/db/repos/campaigns';
import type {Database} from '@/lib/db/repos/common';
const ids=[randomUUID(),randomUUID(),randomUUID()];
const creator={kind:'staff',userId:ids[0],profileId:ids[0]} as const;
const reviewer={kind:'staff',userId:ids[1],profileId:ids[1]} as const;
const segmentId=randomUUID();let pool:Pool;let db:Database;let repository:ReturnType<typeof createCampaignsRepository>;
const template='renewal-reminder';
async function draft(){return createCampaignDraft(creator,{draftId:randomUUID(),segmentId,name:'Synthetic reviewed campaign',channel:'email',template},{campaigns:repository,templates:{list:async()=>[]}});}
describe.skipIf(process.env.FULL_REMEDIATION_ACCEPTANCE_SEED!=='true')('real isolated campaign entry boundaries',()=>{
 beforeAll(async()=>{
  const url=assertIsolatedSeedEnvironment(process.env,{prefix:'FULL_REMEDIATION',flag:'FULL_REMEDIATION_ACCEPTANCE_SEED',hostAllowlistVar:'FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST'});
  if(new URL(url).hostname!=='ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech'||process.env.NEON_PROJECT_ID!=='solitary-wave-52860119')throw Error('UNCONFIRMED_ISOLATED_TARGET');
  pool=new Pool({connectionString:url});await assertSeedSentinel('FULL_REMEDIATION',async()=>Number((await pool.query('SELECT count(*) AS count FROM acceptance_sentinel')).rows[0].count));
  db=drizzle(pool) as unknown as Database;repository=createCampaignsRepository(async()=>db);
  for(const[id,index]of ids.map((id,index)=>[id,index]as const))await pool.query('INSERT INTO profiles(id,auth_user_id,email,display_name,role,consent_marketing) VALUES($1,$1,$2,$3,$4,$5)',[id,'fr-campaign-'+id+'@example.test','Synthetic campaign '+index,index===2?'member':'staff',index===2]);
  await pool.query("INSERT INTO memberships(owner_user_id,plan_code,status,seat_limit) VALUES($1,'community','active',1)",[ids[2]]);
  await pool.query('INSERT INTO saved_segments(id,owner_profile_id,name_en,filter_version,filters) VALUES($1,$2,$3,2,$4::jsonb)',[segmentId,creator.profileId,'Synthetic scoped audience',JSON.stringify({profileIds:[ids[2]],audience:'members'})]);
 });
 afterAll(async()=>{if(pool){const campaigns=(await pool.query('SELECT id FROM campaigns WHERE created_by_profile_id=$1',[creator.profileId])).rows.map(row=>row.id);await pool.query("DELETE FROM audit_events WHERE target_id=ANY($1::text[])",[campaigns]);await pool.query('DELETE FROM campaigns WHERE created_by_profile_id=$1',[creator.profileId]);await pool.query('DELETE FROM saved_segments WHERE id=$1',[segmentId]);await pool.query('DELETE FROM profiles WHERE id=ANY($1::text[])',[ids]);await pool.end();}});
 it('retired legacy queue cannot create an immediately sendable campaign',async()=>{
  await expect(queueCampaign(creator,{segmentId,template,localeStrategy:'profile',idempotencyKey:randomUUID()},repository)).rejects.toThrow('LEGACY_CAMPAIGN_QUEUE_RETIRED');
 },30_000);
 it('repository rejects direct queued campaign creation through any manual writer',async()=>{
  await expect(repository.transaction(creator,store=>repository.createCampaign(creator,store,{segmentId,template,idempotencyKey:randomUUID(),status:'queued'}))).rejects.toThrow('CAMPAIGN_REVIEW_REQUIRED');
 },30_000);
 for(const change of ['content','audience']as const)it('invalidates approval when '+change+' changes before queue',async()=>{
  const {campaignId}=await draft();await repository.transaction(creator,store=>repository.submitForReview(creator,store,campaignId));
  await expect(repository.transaction(creator,store=>repository.recordReview(creator,store,campaignId,{outcome:'approved'}))).rejects.toThrow();
  const snapshot=await repository.transaction(reviewer,store=>repository.campaignFor(reviewer,store,campaignId));
  await repository.transaction(reviewer,store=>repository.recordReview(reviewer,store,campaignId,{outcome:'approved'},snapshot?.reviewRevision));
  if(change==='content')await pool.query("UPDATE campaigns SET template='member-update' WHERE id=$1",[campaignId]);
  else await pool.query("UPDATE campaign_recipients SET variables='{\"displayName\":\"Changed synthetic audience\"}'::jsonb WHERE campaign_id=$1",[campaignId]);
  await expect(repository.transaction(reviewer,store=>repository.queueApproved(reviewer,store,campaignId))).rejects.toThrow();
  expect((await pool.query('SELECT status FROM campaigns WHERE id=$1',[campaignId])).rows).toEqual([{status:'review'}]);
 },30_000);
 it('refuses audience append after a draft is submitted for review',async()=>{
  const {campaignId}=await draft();await repository.transaction(creator,store=>repository.submitForReview(creator,store,campaignId));
  await expect(repository.transaction(creator,store=>repository.insertRecipients(creator,store,campaignId,[{profileId:ids[2],email:'synthetic@example.test',locale:'en',variables:{},status:'queued'}]))).rejects.toThrow('CAMPAIGN_AUDIENCE_FROZEN');
 },30_000);
 it('rejects a stale reviewer version before approval is written',async()=>{
  const {campaignId}=await draft();await repository.transaction(creator,store=>repository.submitForReview(creator,store,campaignId));
  const snapshot=await repository.transaction(reviewer,store=>repository.campaignFor(reviewer,store,campaignId));
  await pool.query("UPDATE campaigns SET name='Changed after review read' WHERE id=$1",[campaignId]);
  await expect(repository.transaction(reviewer,store=>repository.recordReview(reviewer,store,campaignId,{outcome:'approved'},snapshot?.reviewRevision))).rejects.toThrow();
  expect((await pool.query('SELECT reviewed_at FROM campaigns WHERE id=$1',[campaignId])).rows).toEqual([{reviewed_at:null}]);
 },30_000);
 it.each(['legacy','changed','valid']as const)('worker claims only current second-person proof: %s',async mode=>{
  const {campaignId}=await draft();await repository.transaction(creator,store=>repository.submitForReview(creator,store,campaignId));
  const snapshot=await repository.transaction(reviewer,store=>repository.campaignFor(reviewer,store,campaignId));
  if(mode!=='legacy')await repository.transaction(reviewer,store=>repository.recordReview(reviewer,store,campaignId,{outcome:'approved'},snapshot?.reviewRevision));
  await pool.query("UPDATE campaigns SET status='queued' WHERE id=$1",[campaignId]);
  if(mode==='changed')await pool.query("UPDATE campaigns SET name='Changed after approval' WHERE id=$1",[campaignId]);
  // The existing claim scans the shared isolated queue. Roll back the complete
  // transaction so no pre-existing synthetic campaign's claim is persisted.
  const conn=await pool.connect();await conn.query('BEGIN');
  try{const txDb=drizzle(conn) as unknown as AutomationDatabase;const delivery=createCampaignsRepository(async()=>txDb as unknown as Database);
   const claimed=await delivery.claimRecipients(automationCronActor(),new Date(),50,60_000,'email');
   expect(claimed.some(item=>item.campaignId===campaignId)).toBe(mode==='valid');
  }finally{await conn.query('ROLLBACK');conn.release();}
 },30_000);
 it('does not promote a scheduled campaign whose approved audience changed',async()=>{
  const {campaignId}=await draft();await repository.transaction(creator,store=>repository.submitForReview(creator,store,campaignId));
  const snapshot=await repository.transaction(reviewer,store=>repository.campaignFor(reviewer,store,campaignId));
  await repository.transaction(reviewer,store=>repository.recordReview(reviewer,store,campaignId,{outcome:'approved'},snapshot?.reviewRevision));
  await pool.query("UPDATE campaigns SET status='scheduled', scheduled_at=now()-interval '1 minute', name='Changed' WHERE id=$1",[campaignId]);
  const conn=await pool.connect();await conn.query('BEGIN');
  try{const txDb=drizzle(conn) as unknown as Database;const delivery=createCampaignsRepository(async()=>txDb);
   expect((await delivery.promoteScheduledCampaigns(automationCronActor(),new Date(),'email')).promoted).not.toContain(campaignId);
  }finally{await conn.query('ROLLBACK');conn.release();}
 },30_000);

 it('changes the review version when registered WhatsApp content changes',async()=>{
  const {campaignId}=await draft();const conn=await pool.connect();await conn.query('BEGIN');
  try{await conn.query("UPDATE campaigns SET channel='whatsapp', template=NULL, template_key='wtia_announcement_en' WHERE id=$1",[campaignId]);
   const repo=createCampaignsRepository(async()=>drizzle(conn) as unknown as Database);
   const before=await repo.campaignFor(reviewer,drizzle(conn),campaignId);
   await conn.query("UPDATE whatsapp_templates SET previews=jsonb_build_object('en','Changed synthetic review body') WHERE key='wtia_announcement_en'");
   const after=await repo.campaignFor(reviewer,drizzle(conn),campaignId);
   expect(after?.reviewRevision).not.toBe(before?.reviewRevision);
  }finally{await conn.query('ROLLBACK');conn.release();}
 },30_000);

 it('keeps send-time STOP from either consent store effective after a snapshot',async()=>{
  const contact=randomUUID(),suppression=randomUUID();const phone='+8529'+String(parseInt(contact.slice(0,7),16)%10000000).padStart(7,'0');
  const facts=createMessageEligibilityRepository(async()=>db as unknown as AutomationDatabase);
  const who=notificationActor('campaign');const recipient={kind:'member',profileId:ids[2]}as const;
  try{
   await pool.query('UPDATE profiles SET whatsapp_opt_in=true,whatsapp_number=$2 WHERE id=$1',[ids[2],phone]);
   await pool.query("INSERT INTO contacts(id,profile_id,phone_e164,source,whatsapp_opt_in) VALUES($1,$2,$3,'import',true)",[contact,ids[2],phone]);
   const before=await facts.factsFor(who,recipient);expect(before).not.toBeNull();expect(classifyRecipient(before!,'whatsapp')).toBe('eligible');
   await pool.query('UPDATE contacts SET whatsapp_opted_out_at=now() WHERE id=$1',[contact]);
   const stopped=await facts.factsFor(who,recipient);expect(stopped?.whatsappOptIn).toBe(true);expect(classifyRecipient(stopped!,'whatsapp')).toBe('suppressed');
   await pool.query('UPDATE contacts SET whatsapp_opted_out_at=NULL WHERE id=$1',[contact]);
   await pool.query("INSERT INTO message_suppressions(id,profile_id,channel,classification,reason_code) VALUES($1,$2,'whatsapp','marketing','synthetic-stop')",[suppression,ids[2]]);
   expect(classifyRecipient((await facts.factsFor(who,recipient))!,'whatsapp')).toBe('suppressed');
  }finally{await pool.query('DELETE FROM message_suppressions WHERE id=$1',[suppression]);await pool.query('DELETE FROM contacts WHERE id=$1',[contact]);await pool.query('UPDATE profiles SET whatsapp_opt_in=false,whatsapp_number=NULL WHERE id=$1',[ids[2]]);}
 },30_000);
 it('does not widen contacts or both audiences into unrestricted membership',async()=>{
  const contact=randomUUID();
  try{await pool.query("INSERT INTO contacts(id,profile_id,email,source,stage) VALUES($1,$2,$3,'import','closed')",[contact,ids[2],'fr-contact-'+contact+'@example.test']);
   const base={profileIds:[ids[2]],contactSource:['import'],contactStage:['closed']};
   const contacts=await repository.transaction(creator,store=>repository.audienceForSegment(creator,store,parseSegmentFilter(2,{...base,audience:'contacts'})));
   expect(contacts.some(item=>item.id===contact)).toBe(true);expect(contacts.every(item=>item.kind==='contact')).toBe(true);
   const both=await repository.transaction(creator,store=>repository.audienceForSegment(creator,store,parseSegmentFilter(2,{...base,audience:'both'})));
   // Current fail-closed policy: member records have no contact source/stage.
   expect(both.filter(item=>item.kind==='member')).toEqual([]);expect(both.map(item=>item.id).sort()).toEqual(contacts.map(item=>item.id).sort());
   const scoped=await repository.transaction(creator,store=>repository.audienceForSegment(creator,store,parseSegmentFilter(2,{profileIds:[ids[2]],audience:'both'})));
   expect(scoped.filter(item=>item.kind==='member').map(item=>item.id)).toEqual([ids[2]]);
  }finally{await pool.query('DELETE FROM contacts WHERE id=$1',[contact]);}
 },30_000);

});
