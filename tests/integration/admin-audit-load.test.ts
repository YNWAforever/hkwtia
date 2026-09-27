import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {setTimeout as delay} from "node:timers/promises";
import {performance} from "node:perf_hooks";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({database: null as unknown}));
vi.mock("@/lib/db/repos/common", async (original) => ({...await original<typeof import("@/lib/db/repos/common")>(), getDb: async () => state.database}));
import {adminMembersRepository} from "@/lib/db/repos/admin-members";
import {listEventAttendeePage} from "@/lib/db/repos/events";
import {createAdminBatchesRepository, createAdminBatchWorkerRepository, type BatchDatabase} from "@/lib/db/repos/admin-batches";
import {profilePatchBatchHandler} from "@/lib/admin/batches/handlers/profile-patch";
import {batchPreviewDigest, batchRequestSchema} from "@/lib/admin/batches/types";
import {seedM1Plans} from "../../scripts/seed-m1";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1" && process.env.RUN_AUDIT_LOAD === "1";
const container = `hkwtia-audit-load-${process.pid}-${randomUUID().slice(0, 6)}`;
const image = "pgvector/pgvector:pg16";
const staff = {kind: "staff", userId: "load-staff", profileId: "load-staff"} as const;
const eventId = randomUUID();
let pool: Pool;
let database: BatchDatabase;
let capture = false;
const queries: {query: string; params: unknown[]}[] = [];
const report: Record<string, unknown> = {generatedAt: new Date().toISOString(), image, node: process.version, platform: process.platform, syntheticOnly: true, sampleRuns: 20, completed: false};
function docker(args: string[]) {return execFileSync("docker", args, {encoding: "utf8", timeout: 40_000, stdio: ["ignore", "pipe", "pipe"]});}
function summary(values: number[]) {const sorted = [...values].sort((a,b) => a-b); return {samples: values.length, p50Ms: sorted[Math.floor(sorted.length * 0.5)], p95Ms: sorted[Math.min(sorted.length-1, Math.ceil(sorted.length * 0.95)-1)], minMs: sorted[0], maxMs: sorted.at(-1)};}
async function measure(work: () => Promise<unknown>) {const values: number[] = []; for (let i=0; i<20; i++) {const start=performance.now(); await work(); values.push(performance.now()-start);} return summary(values);}

// Deliberately separate opt-in from ordinary integration tests: this is a measured capacity run.
describe.skipIf(!enabled)("audit capacity with the complete schema on disposable PostgreSQL", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", image]);
    for (let i=0; i<60; i++) {try {docker(["exec", container, "pg_isready", "-U", "postgres"]); break;} catch {await delay(200);}}
    const port = docker(["port", container, "5432/tcp"]).trim().split(":").at(-1)!;
    if (!/^\d+$/.test(port)) throw new Error("DISPOSABLE_DATABASE_PORT_UNAVAILABLE");
    pool = new Pool({host: "127.0.0.1", port: Number(port), user: "postgres", password: "test", database: "postgres"});
    const db = drizzle(pool, {logger: {logQuery(query, params) {if (capture) queries.push({query, params});}}});
    state.database = db; database = db as unknown as BatchDatabase;
    report.revision = execFileSync("git", ["rev-parse", "HEAD"], {encoding: "utf8"}).trim();
    report.postgres = (await pool.query("SELECT version() AS v")).rows[0]?.v;
    const migrationStart = performance.now();
    await migrate(db, {migrationsFolder: "drizzle"});
    await migrate(db, {migrationsFolder: "drizzle"});
    report.migrations = {count: (await pool.query("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations")).rows[0]?.n, twiceMs: performance.now()-migrationStart};
    await seedM1Plans(pool); await seedM1Plans(pool);
    await pool.query("INSERT INTO profiles (id,auth_user_id,display_name,role) VALUES ('load-staff','load-staff','Synthetic Staff','staff')");
    await pool.query(`INSERT INTO profiles (id,auth_user_id,display_name,email,phone,job_title,locale)
      SELECT 'load-'||lpad(i::text,5,'0'), 'load-auth-'||i, 'Synthetic Member '||lpad(i::text,5,'0'), 'load-'||i||'@example.test','00000000','Synthetic','en' FROM generate_series(1,10000) i`);
    await pool.query(`INSERT INTO memberships (owner_user_id,plan_code,status,seat_limit,billing_period_end)
      SELECT id,'community','active',1,'2030-12-31' FROM profiles WHERE id LIKE 'load-%' AND role='member'`);
    await pool.query("INSERT INTO events (id,slug,title_en,description_en,starts_at,capacity,published,status) VALUES ($1,'synthetic-load-event','Synthetic event','Local load fixture','2030-12-31',1000,true,'published')", [eventId]);
    await pool.query("INSERT INTO event_registrations (event_id,profile_id,status) SELECT $1,id,'registered' FROM profiles WHERE role='member' ORDER BY id LIMIT 200", [eventId]);
    await pool.query("INSERT INTO event_guest_registrations (event_id,name,email,status,cancel_token_digest,idempotency_key) SELECT $1,'Synthetic Guest '||i,'guest-'||i||'@example.test','registered',md5(i::text)||md5(i::text),'load-guest-'||i FROM generate_series(1,150) i", [eventId]);
    await pool.query(`INSERT INTO event_orders (event_id,buyer_profile_id,buyer_name,buyer_email,buyer_locale,amount_hkd_cents,currency,status,idempotency_key,expires_at,paid_at)
      SELECT $1,id,display_name,email,'en',10000,'hkd','paid','load-order-'||id,'2030-12-31',now() FROM profiles WHERE role='member' ORDER BY id LIMIT 150`, [eventId]);
    await pool.query("INSERT INTO event_order_seats (order_id,position,attendee_name,attendee_email) SELECT id,1,buyer_name,buyer_email FROM event_orders");
    await pool.query("ANALYZE");
  }, 120_000);
  afterAll(async () => {
    try {
      mkdirSync("docs/audits/hkwtia-2026-09-26/evidence", {recursive: true});
      report.completed=report.readsCompleted === true && report.batchCompleted === true;
      writeFileSync("docs/audits/hkwtia-2026-09-26/evidence/admin-load.json", JSON.stringify(report,null,2)+"\n");
      if (pool) await pool.end();
    } finally {try {docker(["rm", "-f", container]);} catch {/* Setup may not have created a container. */}}
  }, 50_000);

  it("measures bounded member and attendee reads and retains EXPLAIN plans", async () => {
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {entries: unknown[]};
    expect(journal.entries.length).toBeGreaterThan(40);
    expect(report.migrations).toMatchObject({count: journal.entries.length});
    capture = true;
    const page = await adminMembersRepository.search(staff, {status: ["active"], limit: 20});
    const member = await adminMembersRepository.getSummary(staff, "load-00001");
    const attendee = await listEventAttendeePage(staff,eventId,{limit:20}, {loadDatabase: async () => database as never});
    capture = false;
    expect(page.totalMatching).toBe(10000); expect(page.items).toHaveLength(20);
    expect(member?.profile.id).toBe("load-00001"); expect(attendee?.items).toHaveLength(20);
    report.memberSearch = await measure(() => adminMembersRepository.search(staff,{status:["active"],limit:20}));
    report.memberSummary = await measure(() => adminMembersRepository.getSummary(staff,"load-00001"));
    report.attendeePage = await measure(() => listEventAttendeePage(staff,eventId,{limit:20},{loadDatabase: async () => database as never}));
    const plans: unknown[]=[];
    for (const query of queries) {const result=await pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.query}`,query.params); plans.push({sql:query.query,plan:result.rows[0]["QUERY PLAN"]});}
    report.explain = plans;
    const ids = new Set<string>(); let cursor: string | null = null;
    do {const next=await listEventAttendeePage(staff,eventId,{limit:50,cursor},{loadDatabase:async()=>database as never}); if(!next)throw new Error("EVENT_NOT_FOUND"); for(const row of next.items) {const id=row.kind === "member" ? row.profileId : row.kind === "guest" ? row.guestId : row.seatId; expect(id).toBeTruthy(); ids.add(`${row.kind}:${id}`);} cursor=next.nextCursor;} while(cursor);
    expect(ids.size).toBe(500); report.attendeeRows=ids.size;
    report.readsCompleted=true;
    process.stdout.write("AUDIT_LOAD_READS_COMPLETE\n");
  }, 180_000);

  it("materializes and settles exactly 5000 corrections through bounded claims", async () => {
    const now=new Date();
    const request=batchRequestSchema.parse({operation:"profile_patch",idempotencyKey:randomUUID(),selection:{mode:"ids",profileIds:Array.from({length:5000},(_,i)=>`load-${String(i+1).padStart(5,"0")}`)},payload:{patch:{locale:"zh-HK"},reason:"Synthetic capacity test"}});
    const batches=createAdminBatchesRepository(async()=>database,()=>new Date());
    const worker=createAdminBatchWorkerRepository(async()=>database);
    const start=performance.now(); const {batchId}=await batches.create(staff,request,batchPreviewDigest(request));
    await worker.prepareNext({profile_patch:profilePatchBatchHandler},now);
    const preview=await batches.preview(staff,batchId);
    expect(preview).toMatchObject({total:5000,eligible:5000,blocked:0});
    const prepareMs=performance.now()-start;
    await batches.commit(staff,batchId,preview.digest);
    const claimTimes:number[]=[]; let processed=0; const executionStart=performance.now();
    while(processed<5000) {
      const tickStart=performance.now(); const claims=await worker.claimItems("load-worker",new Date(),50);
      expect(claims.length).toBeGreaterThan(0); expect(claims.length).toBeLessThanOrEqual(50);
      for(const claim of claims) expect(await worker.executeClaim(claim,profilePatchBatchHandler,new Date())).toBe("settled");
      processed+=claims.length; claimTimes.push(performance.now()-tickStart);
      if(processed%1000===0)process.stdout.write(`AUDIT_LOAD_BATCH_${processed}\n`);
    }
    const final=await batches.preview(staff,batchId);
    expect(final.counters).toEqual({pending:0,running:0,succeeded:5000,skipped:0,failed:0});
    expect((await pool.query("SELECT count(*)::int AS n FROM profiles WHERE locale='zh-HK'")).rows[0]?.n).toBe(5000);
    expect((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='profile.updated'")).rows[0]?.n).toBe(5000);
    report.batch={size:5000,prepareMs,executionMs:performance.now()-executionStart,claims:claimTimes.length,claimSize:50,claimTimings:summary(claimTimes),counters:final.counters};
    report.batchCompleted=true;
  }, 900_000);
});
