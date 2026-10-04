// @vitest-environment node
import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {isolatedAuditDatabase} from "./audit-database-fixture";
import {createWorkspaceSearchRepository} from "@/lib/admin/workspace-search";
const staff = {kind: "staff", profileId: "t18-staff", userId: "t18-auth"} as const;
let f: Awaited<ReturnType<typeof isolatedAuditDatabase>>;
const ids = {company:"18000000-0000-4000-8000-000000000011", application:"18000000-0000-4000-8000-000000000012", event:"18000000-0000-4000-8000-000000000013", conversation:"18000000-0000-4000-8000-000000000014"};
const repo = () => createWorkspaceSearchRepository(async () => f.database);
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== "1")("role scoped workspace search against disposable PostgreSQL", () => {
  beforeAll(async () => {f = await isolatedAuditDatabase();},120000);
  afterAll(async () => {if(f) await f.close();},60000);
  beforeEach(async () => {
    // Only this test's owned loopback PostgreSQL; no configured URL is consumed.
    await f.pool.query("TRUNCATE profiles,companies,events CASCADE");
    await f.pool.query("INSERT INTO profiles(id,auth_user_id,email,display_name,role) VALUES ('t18-staff','t18-auth','staff@t18.example.test','Synthetic Staff','staff'),('t18-member','t18-member-auth','hidden-contact@t18.example.test','Synthetic Match','member'),('t18-exco','t18-exco-auth','exco@t18.example.test','Synthetic ExCo','exco'),('t18-super','t18-super-auth','super@t18.example.test','Synthetic Super','superadmin')");
    await f.pool.query("INSERT INTO companies(id,legal_name,display_name,description) VALUES($1,'Synthetic Match Limited','Synthetic Match','hidden company description')",[ids.company]);
    await f.pool.query("INSERT INTO membership_applications(id,applicant_user_id,company_id,plan_code,status) VALUES($1,'t18-member',$2,'corporate','draft')",[ids.application,ids.company]);
    await f.pool.query("INSERT INTO events(id,slug,title_en,title_zh,description_en,starts_at) VALUES($1,'synthetic-t18-search','Synthetic Match','合成搜尋測試','hidden event body',now())",[ids.event]);
    await f.pool.query("INSERT INTO conversations(id,profile_id,handling,expires_at) VALUES($1,'t18-member','human',now()+interval '1 day')",[ids.conversation]);
  });
  it("returns the five existing entity routes with minimal labels and no contact or message snippets", async () => {
    const result = await repo().searchWorkspace(staff,{query:"Synthetic Match",limit:20});
    expect(result.items.map(i=>i.kind)).toEqual(["member","company","application","event","conversation"]);
    expect(result.items.map(i=>i.href)).toEqual(["/admin/members/t18-member",`/admin/members?companyId=${ids.company}`,`/admin/members/queue/${ids.application}`,`/admin/events-mgmt/${ids.event}`,`/admin/inbox/${ids.conversation}`]);
    for(const item of result.items) expect(Object.keys(item).sort()).toEqual(["href","id","kind","label"]);
    expect(JSON.stringify(result)).not.toMatch(/hidden|email|phone|payload|description|content/);
    expect(result.nextCursor).toBeNull();
  });
  it("denies member and system actors before database loading", async () => {
    let reads=0; const r=createWorkspaceSearchRepository(async()=>{reads++;return f.database;});
    await expect(r.searchWorkspace({kind:"member",profileId:"t18-member",userId:"t18-member-auth"},{query:"Match",limit:20})).rejects.toThrow("FORBIDDEN");
    await expect(r.searchWorkspace({kind:"system",userId:null,source:"stripe-webhook"},{query:"Match",limit:20})).rejects.toThrow("FORBIDDEN");
    expect(reads).toBe(0);
  });
  it("rechecks trusted auth_user_id and current role before returning any item", async () => {
    await expect(repo().searchWorkspace({...staff,userId:"t18-member-auth"},{query:"Match",limit:20})).rejects.toThrow("FORBIDDEN");
    await f.pool.query("UPDATE profiles SET role='member' WHERE id='t18-staff'");
    await expect(repo().searchWorkspace(staff,{query:"Match",limit:20})).rejects.toThrow("FORBIDDEN");
  });
  it.each([{kind:"exco",profileId:"t18-exco",userId:"t18-exco-auth"},{kind:"superadmin",profileId:"t18-super",userId:"t18-super-auth"}] as const)("retains existing $kind admin read capability",async actor=>{
    expect((await repo().searchWorkspace(actor,{query:"Match",limit:20})).items).toHaveLength(5);
  });
  it("empty and oversized queries do not perform database reads",async()=>{
    let reads=0;const r=createWorkspaceSearchRepository(async()=>{reads++;return f.database;});
    expect(await r.searchWorkspace(staff,{query:"  ",limit:20})).toEqual({items:[],nextCursor:null});
    await expect(r.searchWorkspace(staff,{query:"a".repeat(121),limit:20})).rejects.toThrow();
    await expect(r.searchWorkspace(staff,{query:"Match",limit:5000})).rejects.toThrow();
    expect(reads).toBe(0);
  });
  it("never exposes deleted conversations or the separate member/admin agent histories",async()=>{
    await f.pool.query("INSERT INTO conversations(profile_id,agent_kind,status,expires_at) VALUES('t18-member','concierge','deleted',now()),('t18-member','retention-analyst','active',now()),('t18-member','board-reporter','active',now())");
    expect((await repo().searchWorkspace(staff,{query:"Match",limit:20})).items.filter(i=>i.kind==='conversation')).toHaveLength(1);
  });
  it("matches Hong Kong Chinese and treats LIKE wildcards and SQL text literally",async()=>{
    expect((await repo().searchWorkspace(staff,{query:"合成搜尋",limit:20})).items.map(i=>i.id)).toEqual([ids.event]);
    await f.pool.query("INSERT INTO profiles(id,auth_user_id,display_name,role) VALUES('t18-percent','t18-percent-auth','100% Safe','member'),('t18-underscore','t18-underscore-auth','Safe_Name','member')");
    expect((await repo().searchWorkspace(staff,{query:"%",limit:20})).items.map(i=>i.id)).toEqual(['t18-percent']);
    expect((await repo().searchWorkspace(staff,{query:"_",limit:20})).items.map(i=>i.id)).toEqual(['t18-underscore']);
    expect((await repo().searchWorkspace(staff,{query:"' OR TRUE --",limit:20})).items).toEqual([]);
  });
  it.each([51,101])("traverses %i equal labels with bounded stable keysets and binds cursors to actor/query",async count=>{
    await f.pool.query("INSERT INTO profiles(id,auth_user_id,display_name,role) SELECT 't18-keyset-'||lpad(n::text,4,'0'),'t18-keyset-auth-'||n::text,'Synthetic Keyset','member' FROM generate_series(1,$1) n",[count]);
    const r=repo();const first=await r.searchWorkspace(staff,{query:"Keyset",limit:20});
    expect(first.items).toHaveLength(20);expect(first.nextCursor).not.toBeNull();
    expect(first.nextCursor).not.toMatch(/Keyset|t18-auth/);
    let cursor=first.nextCursor;const seen=[...first.items];let pages=1;
    while(cursor){const page=await r.searchWorkspace(staff,{query:"Keyset",limit:20,cursor});expect(page.items.length).toBeLessThanOrEqual(20);seen.push(...page.items);cursor=page.nextCursor;expect(++pages).toBeLessThanOrEqual(6);}
    expect(seen).toHaveLength(count);expect(new Set(seen.map(i=>i.id)).size).toBe(count);
    expect((await r.searchWorkspace(staff,{query:"Keyset",limit:20})).items).toEqual(first.items);
    await expect(r.searchWorkspace(staff,{query:"Match",limit:20,cursor:first.nextCursor!})).rejects.toThrow("INVALID_CURSOR");
    await expect(r.searchWorkspace({kind:"exco",profileId:"t18-exco",userId:"t18-exco-auth"},{query:"Keyset",limit:20,cursor:first.nextCursor!})).rejects.toThrow("INVALID_CURSOR");
  });
  it("paginates valid profile IDs longer than the shared sort-key slot",async()=>{
    await f.pool.query("INSERT INTO profiles(id,auth_user_id,display_name,role) SELECT $1||lpad(n::text,3,'0'),$1||lpad(n::text,3,'0'),'Synthetic long ID','member' FROM generate_series(1,21) n",['t18-'+"x".repeat(120)]);
    const r=repo(),first=await r.searchWorkspace(staff,{query:'long ID',limit:20});expect(first.items).toHaveLength(20);expect(first.nextCursor).not.toBeNull();
    const second=await r.searchWorkspace(staff,{query:'long ID',limit:20,cursor:first.nextCursor!});expect(second.items).toHaveLength(1);expect(second.nextCursor).toBeNull();expect(new Set([...first.items,...second.items].map(i=>i.id)).size).toBe(21);
  });
  it("finds record IDs without an unrestricted scan or arbitrary result destinations",async()=>{
    expect((await repo().searchWorkspace(staff,{query:ids.application,limit:20})).items).toEqual([expect.objectContaining({kind:'application',id:ids.application})]);
    await expect(repo().searchWorkspace(staff,{query:"Match",limit:20,cursor:'https://outside.example.test'})).rejects.toThrow("INVALID_CURSOR");
    await expect(repo().searchWorkspace(staff,{query:"Match",limit:20,cursor:'a'.repeat(1001)})).rejects.toThrow();
  });
  it("distinguishes a failed read from a successful empty result",async()=>{
    const r=createWorkspaceSearchRepository(async()=>{throw Error("CONTROLLED_DB_FAILURE");});
    await expect(r.searchWorkspace(staff,{query:"Match",limit:20})).rejects.toThrow("CONTROLLED_DB_FAILURE");
    expect((await repo().searchWorkspace(staff,{query:"no match at all",limit:20})).items).toEqual([]);
  });
});
