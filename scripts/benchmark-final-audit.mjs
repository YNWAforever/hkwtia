// Synthetic, disposable PostgreSQL 16 benchmark for the final audit.
import {execFileSync} from "node:child_process";
import {performance} from "node:perf_hooks";
import {setTimeout as delay} from "node:timers/promises";
import pg from "pg";

const container = "hkwtia-final-bench-" + process.pid;
const docker = (...args) => execFileSync("docker", args, {encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});
let pool;
try {
  docker("run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine");
  let ready = false;
  for (let i = 0; i < 60; i += 1) {
    try { docker("exec", container, "pg_isready", "-U", "postgres"); ready = true; break; }
    catch { await delay(100); }
  }
  if (!ready) throw new Error("disposable PostgreSQL did not become ready");
  const port = docker("port", container, "5432/tcp").trim().split(":").at(-1);
  if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL port unavailable");
  pool = new pg.Pool({connectionString: "postgresql://postgres:test@127.0.0.1:" + port + "/postgres?sslmode=disable"});
  const ddl = [
    "CREATE TABLE profiles(id text PRIMARY KEY,display_name text,last_login_at timestamptz)",
    "CREATE TABLE companies(id uuid PRIMARY KEY,slug text,display_name text,tagline_en text,tagline_zh_hk text,tags text[] DEFAULT '{}',website text,logo_media_id uuid,public_profile_status text)",
    "CREATE TABLE company_members(user_id text,company_id uuid,revoked_at timestamptz)",
    "CREATE TABLE memberships(id uuid PRIMARY KEY,owner_user_id text,company_id uuid,plan_code text,status text,billing_period_end timestamptz,created_at timestamptz,grant_effective_at timestamptz,grant_expires_at timestamptz)",
    "CREATE TABLE engagement_scores(profile_id text,score numeric,trend numeric)",
    "CREATE TABLE media(id uuid,url text,archived_at timestamptz)",
    "CREATE TABLE approvals(id uuid,status text)",
    "CREATE TABLE showcase_listings(id uuid,status text)",
    "CREATE TABLE staff_tasks(id uuid,status text,created_at timestamptz)",
    "CREATE TABLE posts(id uuid,kind text,published_at timestamptz)",
    "CREATE INDEX companies_public_profile_idx ON companies(public_profile_status,display_name)",
    "CREATE INDEX memberships_company_idx ON memberships(company_id)",
    "CREATE INDEX company_members_user_idx ON company_members(user_id)",
    "CREATE INDEX company_members_company_idx ON company_members(company_id)",
    "CREATE INDEX engagement_scores_profile_idx ON engagement_scores(profile_id)",
  ];
  for (const query of ddl) await pool.query(query);
  await pool.query("INSERT INTO profiles SELECT md5('p'||n)::uuid::text,'Member '||lpad(n::text,5,'0'), now()-((n%120)||' days')::interval FROM generate_series(1,10000) n");
  await pool.query("INSERT INTO companies SELECT md5('c'||n)::uuid,'member-'||n,'Company '||lpad(n::text,5,'0'),NULL,NULL,'{}',NULL,NULL,CASE WHEN n%4=0 THEN 'published' ELSE 'hidden' END FROM generate_series(1,10000) n");
  await pool.query("INSERT INTO company_members SELECT md5('p'||n)::uuid::text,md5('c'||n)::uuid,NULL FROM generate_series(1,10000) n");
  await pool.query("INSERT INTO memberships SELECT md5('m'||n)::uuid,NULL,md5('c'||n)::uuid,CASE WHEN n%10=0 THEN 'corporate' ELSE 'community' END,CASE WHEN n%7=0 THEN 'past_due' ELSE 'active' END,now()+((n%180)||' days')::interval,now(),NULL,NULL FROM generate_series(1,10000) n");
  await pool.query("INSERT INTO engagement_scores SELECT md5('p'||n)::uuid::text,n%100,CASE WHEN n%2=0 THEN -1 ELSE 1 END FROM generate_series(1,10000) n");
  for (const table of ["approvals","showcase_listings","staff_tasks","posts"]) {
    const columns = table === "posts" ? "(id,kind,published_at)" : table === "staff_tasks" ? "(id,status,created_at)" : "(id,status)";
    const values = table === "posts" ? "md5('news'||n)::uuid,'news',NULL" : table === "staff_tasks" ? "md5('task'||n)::uuid,'open',now()" : "md5('" + table + "'||n)::uuid," + (table === "approvals" ? "'pending'" : "'pending_review'");
    await pool.query("INSERT INTO " + table + columns + " SELECT " + values + " FROM generate_series(1,200) n");
  }
  await pool.query("ANALYZE");
  const oldDashboard = [
    "SELECT * FROM approvals WHERE status='pending'",
    "SELECT p.id,m.id,m.billing_period_end,e.score,e.trend,p.last_login_at FROM profiles p LEFT JOIN company_members cm ON cm.user_id=p.id AND cm.revoked_at IS NULL LEFT JOIN companies c ON c.id=cm.company_id JOIN memberships m ON m.owner_user_id=p.id OR m.company_id=cm.company_id LEFT JOIN engagement_scores e ON e.profile_id=p.id WHERE m.status IN ('active','past_due') ORDER BY m.billing_period_end NULLS LAST,p.id,m.id",
    "SELECT * FROM showcase_listings",
    "SELECT * FROM companies WHERE public_profile_status='pending_review'",
    "SELECT * FROM staff_tasks WHERE status='open' ORDER BY created_at DESC,id DESC LIMIT 200",
    "SELECT * FROM posts WHERE kind='news'",
  ];
  const newDashboard = [
    "SELECT count(*) FROM approvals WHERE status='pending'",
    "WITH candidate_memberships AS (SELECT m.owner_user_id AS profile_id,m.billing_period_end AS renewal_at FROM memberships m WHERE m.owner_user_id IS NOT NULL AND m.status IN ('active','past_due') UNION ALL SELECT cm.user_id AS profile_id,m.billing_period_end AS renewal_at FROM memberships m JOIN company_members cm ON cm.company_id=m.company_id AND cm.revoked_at IS NULL WHERE m.company_id IS NOT NULL AND m.status IN ('active','past_due')) SELECT count(DISTINCT p.id) FROM candidate_memberships candidates JOIN profiles p ON p.id=candidates.profile_id LEFT JOIN engagement_scores e ON e.profile_id=p.id WHERE ((e.score<20 AND e.trend<0) OR ((p.last_login_at IS NULL OR p.last_login_at<=now()-interval '90 days') AND candidates.renewal_at>=now() AND candidates.renewal_at<=now()+interval '120 days'))",
    "SELECT count(*) FROM showcase_listings",
    "SELECT count(*) FROM companies WHERE public_profile_status='pending_review'",
    "SELECT count(*) FROM staff_tasks WHERE status='open'",
    "SELECT count(*) FROM posts WHERE kind='news' AND published_at IS NULL",
  ];
  const directoryFrom = " FROM companies c LEFT JOIN LATERAL (SELECT plan_code FROM memberships m WHERE m.company_id=c.id AND m.status IN ('active','past_due','cancel_at_period_end') AND ((m.grant_effective_at IS NULL AND m.grant_expires_at IS NULL) OR (m.grant_effective_at<=now() AND m.grant_expires_at>now())) ORDER BY m.created_at DESC LIMIT 1) active_plan ON true LEFT JOIN media ON media.id=c.logo_media_id AND media.archived_at IS NULL WHERE c.public_profile_status='published' AND c.slug IS NOT NULL";
  const directoryOrder = " ORDER BY CASE active_plan.plan_code WHEN 'patron' THEN 0 WHEN 'corporate' THEN 1 ELSE 2 END,c.display_name,c.id";
  const directoryColumns = "SELECT c.id,c.slug,c.display_name,c.tagline_en,c.tagline_zh_hk,c.tags,c.website,active_plan.plan_code,media.url";
  const oldDirectory = directoryColumns+directoryFrom+directoryOrder;
  const newDirectory = directoryColumns+directoryFrom+directoryOrder+" LIMIT 25";
  const memberSearch = "SELECT p.id,p.display_name FROM profiles p WHERE position('member 0001' in lower(p.display_name))>0 ORDER BY lower(p.display_name),p.id LIMIT 51";

  async function measure(statements) {
    async function execute() {
      const begin = performance.now();
      let rows = 0;
      for (const statement of statements) rows += (await pool.query(statement)).rowCount;
      return {ms: performance.now()-begin,rows};
    }
    const first = await execute();
    const warm = [];
    for (let i = 0; i < 20; i += 1) warm.push((await execute()).ms);
    warm.sort((a,b)=>a-b);
    return {queryCount: statements.length,returnedRows:first.rows,firstRunMs:+first.ms.toFixed(3),warmP50Ms:+warm[9].toFixed(3),warmP95Ms:+warm[18].toFixed(3),warmMs:warm.map(n=>+n.toFixed(3))};
  }
  async function explain(statement) {
    const result = await pool.query("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) "+statement);
    return result.rows[0]["QUERY PLAN"][0];
  }
  const result = {
    environment:"disposable PostgreSQL 16-alpine, loopback, 10000 synthetic profiles/companies/memberships; 2500 published; 200 each auxiliary queue",
    conditions:"Single Node.js process, sequential queries, 1 first-run plus 20 warm runs; DB buffers may already be warm, so first-run is not a true cold-region measurement.",
    before:process.argv.includes("--after-only") ? null : {dashboard:await measure(oldDashboard),directory:await measure([oldDirectory]),memberSearch:await measure([memberSearch])},
    after:{dashboard:await measure(newDashboard),directory:await measure([newDirectory]),memberSearch:await measure([memberSearch])},
    plans:{beforeAtRisk:process.argv.includes("--after-only") ? null : await explain(oldDashboard[1]),afterAtRisk:await explain(newDashboard[1]),beforeDirectory:process.argv.includes("--after-only") ? null : await explain(oldDirectory),afterDirectory:await explain(newDirectory)},
  };
  process.stdout.write(JSON.stringify(result,null,2)+"\n");
} finally {
  if (pool) await pool.end();
  try { docker("rm","-f",container); } catch { /* Setup may have failed. */ }
}
