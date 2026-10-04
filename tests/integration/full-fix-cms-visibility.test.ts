// @vitest-environment node
import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import {isolatedAuditDatabase} from "./audit-database-fixture";
const state=vi.hoisted(()=>({database:null as Awaited<ReturnType<typeof isolatedAuditDatabase>>["database"]|null}));
vi.mock("@/lib/db/repos/common",async original=>({...await original<typeof import("@/lib/db/repos/common")>(),getDb:async()=>{if(!state.database)throw Error("DISPOSABLE_DB_NOT_READY");return state.database;}}));
import {readCopyWorkspace,saveCopyDraft,publishCopyDraft,readPrivateCopyDraft,listPageCopyForLocale} from "@/lib/db/repos/page-copy";
import {createCompanyProfilesRepository} from "@/lib/db/repos/company-profiles";
import {setMediaArchived,mediaRepository} from "@/lib/db/repos/media";
const editor={kind:"staff",profileId:"t17-editor",userId:"t17-auth"} as const;
const other={kind:"staff",profileId:"t17-other",userId:"t17-other-auth"} as const;
let f:Awaited<ReturnType<typeof isolatedAuditDatabase>>;
async function draft(value="Synthetic unpublished English",zh="合成未發布中文") {
 const w=await readCopyWorkspace(editor,"Home");return saveCopyDraft(editor,{namespace:"Home",baseRevision:w.revision,expectedDraftRevision:null,changes:{"en:hero.title":value,"zh-HK:hero.title":zh}});
}
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION!=="1")("full content visibility and referenced-media boundaries through real PostgreSQL",()=>{
 beforeAll(async()=>{f=await isolatedAuditDatabase();state.database=f.database;vi.stubEnv("CMS_SERVER_DRAFTS_ENABLED","true");await f.pool.query("INSERT INTO profiles(id,auth_user_id,display_name,role) VALUES('t17-editor','t17-auth','Synthetic T17 Editor','staff'),('t17-other','t17-other-auth','Synthetic T17 Other','staff'),('t17-member','t17-member-auth','Synthetic T17 Member','member')");},120000);
 beforeEach(async()=>{await f.pool.query("TRUNCATE page_copy_drafts,page_copy,companies,media CASCADE");});
 afterAll(async()=>{vi.unstubAllEnvs();state.database=null;if(f)await f.close();});
 it("private bilingual draft remains absent from both public reads until atomic publish and changes only its namespace",async()=>{
  await f.pool.query("INSERT INTO page_copy(locale,namespace,key_path,value) VALUES('en','About','metaTitle','Synthetic unrelated publication')");
  const before=await listPageCopyForLocale("en"),x=await draft();expect(await listPageCopyForLocale("en")).toEqual(before);expect(await listPageCopyForLocale("zh-HK")).toEqual([]);
  await publishCopyDraft(editor,{draftId:x.draftId,expectedDraftRevision:x.revision,expectedPublishedRevision:x.publishedRevision});
  expect(await listPageCopyForLocale("en")).toContainEqual({namespace:"About",keyPath:"metaTitle",value:"Synthetic unrelated publication"});
  expect(await listPageCopyForLocale("en")).toContainEqual({namespace:"Home",keyPath:"hero.title",value:"Synthetic unpublished English"});
  expect(await listPageCopyForLocale("zh-HK")).toContainEqual({namespace:"Home",keyPath:"hero.title",value:"合成未發布中文"});
 });
 it("another editor and a stale tab cannot read or overwrite a private draft, even after changed public content",async()=>{
  const x=await draft();await expect(readPrivateCopyDraft(other,x.draftId)).rejects.toThrow("PAGE_COPY_DRAFT_NOT_FOUND");
  const y=await saveCopyDraft(editor,{namespace:"Home",baseRevision:x.publishedRevision,expectedDraftRevision:x.revision,changes:{"zh-HK:hero.title":"合成第二版本"}});
  await expect(saveCopyDraft(editor,{namespace:"Home",baseRevision:x.publishedRevision,expectedDraftRevision:x.revision,changes:{"en:hero.title":"stale overwrite"}})).rejects.toThrow("PAGE_COPY_EDIT_CONFLICT");
  expect((await readPrivateCopyDraft(editor,x.draftId)).entries).toContainEqual({locale:"zh-HK",keyPath:"hero.title",value:"合成第二版本"});
  expect(y.revision).not.toBe(x.revision);expect(await listPageCopyForLocale("en")).toEqual([]);
 });
 it("a company logo reference prevents archive without blanking that company's existing public logo",async()=>{
  const media=randomUUID(),company=randomUUID();await f.pool.query("INSERT INTO media(id,url,alt_en,alt_zh) VALUES($1,'https://assets.example.test/t17-company.png','Synthetic logo','合成標誌')",[media]);
  await f.pool.query("INSERT INTO companies(id,legal_name,display_name,logo_media_id,slug,public_profile_status) VALUES($1,'Synthetic Company Limited','Synthetic Company',$2,'synthetic-t17-company','published')",[company,media]);
  await expect(setMediaArchived(editor,media,true)).rejects.toMatchObject({issues:[expect.objectContaining({message:"MEDIA_IN_USE"})]});
  expect((await f.pool.query("SELECT archived_at FROM media WHERE id=$1",[media])).rows).toEqual([{archived_at:null}]);
  expect((await f.pool.query("SELECT logo_media_id FROM companies WHERE id=$1",[company])).rows).toEqual([{logo_media_id:media}]);
  expect((await f.pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='media.archived' AND target_id=$1",[media])).rows).toEqual([{n:0}]);
 });

 it("company attachment rechecks owned active media in its transaction if archive wins after preflight",async()=>{
  const media=randomUUID(),company=randomUUID(),member={kind:"member",profileId:"t17-member",userId:"t17-member-auth"} as const;
  await f.pool.query("INSERT INTO media(id,url,alt_en,alt_zh,registered_by_profile_id) VALUES($1,'https://assets.example.test/t17-race.png','Synthetic race','合成競態','t17-member')",[media]);
  await f.pool.query("INSERT INTO companies(id,legal_name,display_name) VALUES($1,'Synthetic Race Limited','Synthetic Race')",[company]);
  await f.pool.query("INSERT INTO company_members(company_id,user_id,role) VALUES($1,'t17-member','owner')",[company]);
  // Only inject the interleaving through the existing preflight port. Both
  // preflight and archive execute real repositories against this owned DB.
  const repo=createCompanyProfilesRepository({getOwnedMedia:async(actor,id)=>{
   const owned=await mediaRepository.getOwnedByProfile(actor,id);expect(owned?.id).toBe(media);
   await setMediaArchived(editor,id,true);return owned;
  }});
  await expect(repo.updateProfile(member,company,{slug:"synthetic-race",logoMediaId:media})).rejects.toThrow("COMPANY_LOGO_INVALID");
  expect((await f.pool.query("SELECT logo_media_id FROM companies WHERE id=$1",[company])).rows).toEqual([{logo_media_id:null}]);
 });
 it("an unreferenced media entry can still be archived once and restored without duplicate audit",async()=>{
  const media=randomUUID();await f.pool.query("INSERT INTO media(id,url,alt_en,alt_zh) VALUES($1,'https://assets.example.test/t17-unused.png','Synthetic unused','合成未用')",[media]);
  await setMediaArchived(editor,media,true);await setMediaArchived(editor,media,true);
  expect((await f.pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='media.archived' AND target_id=$1",[media])).rows).toEqual([{n:1}]);
  expect((await setMediaArchived(editor,media,false))?.archivedAt).toBeNull();
 });
});
