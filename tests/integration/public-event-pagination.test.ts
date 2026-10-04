// @vitest-environment node
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";
import {createHash} from "node:crypto";
import {readFileSync, writeFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {isolatedAuditDatabase} from "./audit-database-fixture";
import {countPublicEvents, listPublicEvents} from "@/lib/db/repos/events";
import {parseEventFilters} from "@/lib/events/filters";
let fixture: Awaited<ReturnType<typeof isolatedAuditDatabase>>;
vi.mock("@/lib/db/repos/common", () => ({getDb: async () => fixture.database}));
const actor = {kind: "anonymous", userId: null} as const;
const asOf = new Date("2030-01-01T10:00:00Z");
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== "1")("bounded public activity PostgreSQL pagination", () => {
  beforeAll(async () => {
    fixture = await isolatedAuditDatabase();
    await fixture.pool.query(`INSERT INTO events(id,slug,title_en,description_en,starts_at,ends_at,status,visibility,published,member_only,tags)
      SELECT md5('t15-public-'||n)::uuid,'t15-public-'||lpad(n::text,2,'0'),'Synthetic activity '||n,'Synthetic public pagination',
      '2030-01-01T09:00:00Z'::timestamptz,'2030-01-01T12:00:00Z'::timestamptz,'published','public',true,false,ARRAY['ai'] FROM generate_series(0,24) n`);
    await fixture.pool.query(`INSERT INTO events(id,slug,title_en,description_en,starts_at,ends_at,status,visibility,published,member_only,tags)
      VALUES('a1000000-0000-4000-8000-000000000001','hidden','Synthetic hidden','Synthetic','2030-01-01T09:00Z','2030-01-01T12:00Z','published','members_only',true,true,ARRAY['ai']),
      ('a1000000-0000-4000-8000-000000000002','draft','Synthetic draft','Synthetic','2030-01-01T09:00Z','2030-01-01T12:00Z','draft','public',false,false,ARRAY['ai']),
      ('a1000000-0000-4000-8000-000000000003','other','Synthetic other tag','Synthetic','2030-01-01T09:00Z','2030-01-01T12:00Z','published','public',true,false,ARRAY['health'])`);
  },60000);
  afterAll(async () => {await fixture?.close();});
  it("uses actual LIMIT/OFFSET without losing, repeating or exposing filtered rows", async () => {
    const filters=parseEventFilters({tag:"ai"});
    expect(await countPublicEvents(actor,{status:"open",asOf,filters})).toBe(25);
    const pages=await Promise.all([0,12,24,36].map(offset=>listPublicEvents(actor,{status:"open",asOf,filters,limit:12,offset,locale:"zh-HK"})));
    expect(pages.map(page=>page.length)).toEqual([12,12,1,0]);
    expect(pages.flat().map(row=>row.slug)).toEqual(Array.from({length:25},(_,n)=>`t15-public-${String(n).padStart(2,"0")}`));
    expect(new Set(pages.flat().map(row=>row.id)).size).toBe(25);
    writeFileSync('docs/audits/hkwtia-2026-10-03-full-fix/evidence/t15/public-pagination-postgres.json',JSON.stringify({
      observedAt:new Date().toISOString(),sourceSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),workingTree:true,
      testSha256:createHash('sha256').update(readFileSync('tests/integration/public-event-pagination.test.ts')).digest('hex'),
      isolated:'owned disposable loopback PostgreSQL16',ledger:Number((await fixture.pool.query('SELECT count(*) n FROM drizzle.__drizzle_migrations')).rows[0].n),
      pass:1,fail:0,skip:0,filteredTotal:25,pageCounts:pages.map(p=>p.length),distinct:25,production:false,providerCalls:0},null,2));
  });
});
