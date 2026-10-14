import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import {Pool} from "pg";

/** Disposable, loopback-only database. Never accepts a supplied database URL. */
export function portalHistoryPostgres() {
  const name = `hkwtia-history-${randomUUID()}`;
  let started = false;
  let pool: Pool | undefined;
  function docker(args: string[]) { return execFileSync("docker", args, {encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]}); }
  return {
    async start() {
      docker(["run", "--rm", "-d", "--name", name, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
      started = true;
      for (let attempt = 0; attempt < 60; attempt++) {
        try { docker(["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]); break; }
        catch { if (attempt === 59) throw new Error("disposable PostgreSQL did not become ready"); await delay(100); }
      }
      const binding = docker(["port", name, "5432/tcp"]).trim();
      const port = binding.slice(binding.lastIndexOf(":") + 1);
      if (!/^\d+$/.test(port)) throw new Error("invalid disposable PostgreSQL port");
      pool = new Pool({connectionString: `postgresql://postgres:test@127.0.0.1:${port}/postgres?sslmode=disable`});
      await pool.query(`CREATE TABLE events (id uuid PRIMARY KEY, title_en text NOT NULL, title_zh text, starts_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'published', visibility text NOT NULL DEFAULT 'members_only');
        CREATE TABLE event_orders (id uuid PRIMARY KEY, event_id uuid NOT NULL, buyer_profile_id text, buyer_email text, status text NOT NULL,
          amount_hkd_cents integer NOT NULL, currency text NOT NULL, paid_at timestamptz, refunded_at timestamptz);
        CREATE TABLE event_registrations (event_id uuid NOT NULL, profile_id text NOT NULL, status text NOT NULL, PRIMARY KEY (event_id, profile_id));`);
      return pool;
    },
    async stop() {
      try { await pool?.end(); }
      finally { if (started) {docker(["rm", "-f", name]); started = false;} }
    },
  };
}
