import {copyFileSync,mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {join,resolve,sep} from "node:path";
import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {Pool} from "pg";
import {seedM1Plans} from "../../scripts/seed-m1";

/** Always owns a disposable loopback container; never consumes a configured database URL. */
export async function isolatedAuditDatabase(through?: number) {
  const container = `hkwtia-audit-${process.pid}-${randomUUID().slice(0, 8)}`;
  const docker = (args: string[]) => execFileSync("docker", args, {encoding: "utf8", timeout: 40_000, stdio: ["ignore", "pipe", "pipe"]});
  let pool: Pool | undefined;
  try {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "pgvector/pgvector:pg16"]);
    for (let i = 0; i < 60; i++) {try {docker(["exec", container, "pg_isready", "-U", "postgres"]); break;} catch {await delay(200);}}
    const port = docker(["port", container, "5432/tcp"]).trim().split(":").at(-1)!;
    if (!/^\d+$/.test(port)) throw new Error("DISPOSABLE_DATABASE_PORT_UNAVAILABLE");
    pool = new Pool({host: "127.0.0.1", port: Number(port), user: "postgres", password: "test", database: "postgres"});
    const database = drizzle(pool);
    async function applyTemporaryJournal(throughIndex: number, historicalOrdering = false) {
      // This function can only reach this fixture's freshly created loopback container.
      // The repository journal is read-only, including during the historical regression demonstration.
      const root=resolve(".tmp"); mkdirSync(root,{recursive:true}); const temporary=mkdtempSync(join(root,"audit-migrations-"));
      try {
        const journal=JSON.parse(readFileSync("drizzle/meta/_journal.json","utf8")) as {entries:{idx:number;tag:string;when:number}[]};
        journal.entries=journal.entries.filter(entry=>entry.idx<=throughIndex);
        if(historicalOrdering){const grant=journal.entries.find(entry=>entry.idx===48);if(!grant)throw new Error("GRANT_MIGRATION_MISSING");grant.when=1790457600000;}
        mkdirSync(join(temporary,"meta")); writeFileSync(join(temporary,"meta/_journal.json"),JSON.stringify(journal));
        for(const entry of journal.entries)copyFileSync(join("drizzle",entry.tag+".sql"),join(temporary,entry.tag+".sql"));
        await migrate(database,{migrationsFolder:temporary});
      } finally {
        if(!resolve(temporary).startsWith(root+sep))throw new Error("INVALID_FIXTURE_DIRECTORY");
        rmSync(temporary,{recursive:true,force:true});
      }
    }
    if (through === undefined) await migrate(database, {migrationsFolder: "drizzle"});
    else await applyTemporaryJournal(through);
    await seedM1Plans(pool);
    return {pool, database, applyHistoricalOrdering: () => applyTemporaryJournal(49,true), migrateRemaining: () => migrate(database, {migrationsFolder: "drizzle"}), close: async () => {await pool!.end(); docker(["rm", "-f", container]);}};
  } catch (error) {
    if (pool) await pool.end();
    try {docker(["rm", "-f", container]);} catch {/* No container when creation failed. */}
    throw error;
  }
}
