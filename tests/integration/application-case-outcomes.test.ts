// @vitest-environment node
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApplicationCasesRepository } from "@/lib/db/repos/applications";
import type { Database } from "@/lib/db/repos/common";
import type { ApplicationCasePatch } from "@/lib/admin/application-case-types";

// Requires cached PostgreSQL 16 (pre-pulled by the manual acceptance job).
// No environment connection string is consumed. No repository migrations run.
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== "1")(
  "application case outcomes on an owned disposable PostgreSQL 16",
  () => {
    const name = `hkwtia-case-outcomes-${randomUUID()}`;
    const docker = (args: string[]) => execFileSync("docker", args, {
      encoding: "utf8", timeout: 40_000, stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    const actor = { kind: "staff", profileId: "synthetic-staff", userId: "synthetic-auth" } as const;
    let container: string | undefined, pool: Pool;
    let repo: ReturnType<typeof createApplicationCasesRepository>;
    let id: string;
    const patch = (overrides: Partial<ApplicationCasePatch> = {}): ApplicationCasePatch => ({
      expectedVersion: "0", requestId: randomUUID(), note: "Synthetic review",
      ownerProfileId: actor.profileId, dueAt: "2030-12-01T02:00:00.000Z",
      missingFields: ["companyWebsite"], nextActionCode: "await_documents", ...overrides,
    });
    async function snapshot() {
      const app = (await pool.query("SELECT * FROM membership_applications WHERE id=$1", [id])).rows;
      const tasks = (await pool.query("SELECT * FROM staff_tasks WHERE dedupe_key=$1 ORDER BY id", ["membership-application:" + id])).rows;
      const audits = (await pool.query("SELECT * FROM audit_events WHERE target_id=$1 ORDER BY id", [id])).rows;
      return { app, tasks, audits };
    }
    beforeAll(async () => {
      container = docker(["run", "--pull=never", "--rm", "-d", "--name", name,
        "--label", "hkwtia.fixture=case-outcomes", "-e", "POSTGRES_PASSWORD=synthetic-local-only",
        "-p", "127.0.0.1::5432", "--tmpfs", "/var/lib/postgresql/data", "postgres:16"]);
      const info = JSON.parse(docker(["inspect", container]))[0];
      const binding = info.NetworkSettings.Ports["5432/tcp"][0];
      expect(info.Name).toBe("/" + name);
      expect(info.Config.Labels["hkwtia.fixture"]).toBe("case-outcomes");
      expect(binding.HostIp).toBe("127.0.0.1");
      pool = new Pool({ host: binding.HostIp, port: Number(binding.HostPort),
        user: "postgres", password: "synthetic-local-only", database: "postgres", max: 5 });
      let ready = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        try { await pool.query("SELECT 1"); ready = true; break; }
        catch { await delay(200); }
      }
      expect(ready).toBe(true);
      // Minimal synthetic schema, not a copy of any application database.
      await pool.query(`
        CREATE TYPE staff_task_status AS ENUM ('open','resolved');
        CREATE TABLE profiles(id text PRIMARY KEY,role text NOT NULL);
        CREATE TABLE membership_applications(id uuid PRIMARY KEY,applicant_user_id text NOT NULL,
          status text NOT NULL DEFAULT 'draft',updated_at timestamptz NOT NULL DEFAULT now());
        CREATE TABLE staff_tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),profile_id text,
          kind text NOT NULL,dedupe_key text UNIQUE NOT NULL,summary_code text,
          context jsonb NOT NULL,status staff_task_status,resolved_at timestamptz,
          resolved_by_profile_id text,updated_at timestamptz DEFAULT now(),
          CHECK (summary_code <> 'contact_applicant'));
        CREATE TABLE audit_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_type text,
          actor_user_id text,action text,target_type text,target_id text,metadata jsonb,
          created_at timestamptz DEFAULT now(),CHECK (metadata->>'note' <> 'SYNTHETIC_AUDIT_FAILURE'));
        INSERT INTO profiles VALUES('synthetic-staff','staff');
      `);
      repo = createApplicationCasesRepository(async () => drizzle(pool) as unknown as Database);
      console.info("ISOLATION_VERIFIED", JSON.stringify({
        container, name, image: info.Config.Image, host: binding.HostIp,
        port: binding.HostPort, fixtures: "synthetic only", storage: "owned tmpfs", migrations: 0,
      }));
    }, 60_000);
    afterAll(async () => {
      await pool?.end();
      if (container) {
        const owned = JSON.parse(docker(["inspect", container]))[0];
        expect(owned.Name).toBe("/" + name);
        expect(owned.Config.Labels["hkwtia.fixture"]).toBe("case-outcomes");
        docker(["rm", "-f", container]);
        expect(docker(["ps", "-aq", "--filter", `id=${container}`])).toBe("");
        console.info("CLEANUP_READBACK", JSON.stringify({ container, remaining: 0 }));
      }
    }, 45_000);
    beforeEach(async () => {
      id = randomUUID();
      await pool.query("INSERT INTO membership_applications(id,applicant_user_id) VALUES($1,'synthetic-member')", [id]);
    });
    it("valid version zero writes one task and audit without changing the application", async () => {
      const before = await snapshot();
      const saved = await repo.updateApplicationCase(actor, id, patch());
      const after = await snapshot();
      expect(after.app).toEqual(before.app);
      expect(after.tasks).toHaveLength(1);
      expect(after.audits).toHaveLength(1);
      expect(after.tasks[0].context.caseVersion).toBe(saved.version);
      expect(after.audits[0].metadata.case.caseVersion).toBe(saved.version);
      expect(after.audits[0].metadata.previousVersion).toBe("0");
    });
    it("a demonstrably stale request changes nothing after the legitimate winner", async () => {
      await repo.updateApplicationCase(actor, id, patch());
      const afterWinner = await snapshot();
      await expect(repo.updateApplicationCase(actor, id, patch())).rejects.toThrow("APPLICATION_CASE_VERSION_CONFLICT");
      expect(await snapshot()).toEqual(afterWinner);
    });
    it("an exact request replay returns its receipt without a second task or audit", async () => {
      const intent = patch();
      const saved = await repo.updateApplicationCase(actor, id, intent);
      const beforeReplay = await snapshot();
      expect(await repo.updateApplicationCase(actor, id, intent)).toEqual(saved);
      expect(await snapshot()).toEqual(beforeReplay);
    });
    it("concurrent same-request handlers acknowledge one logical write", async () => {
      const intent = patch();
      const results = await Promise.all([repo.updateApplicationCase(actor,id,intent),repo.updateApplicationCase(actor,id,intent)]);
      expect(results[0]).toEqual(results[1]);
      const after = await snapshot();
      expect(after.tasks).toHaveLength(1);
      expect(after.audits).toHaveLength(1);
    });
    it("a receipt remains attributable to its original intent after a newer save", async () => {
      const intent = patch(), first = await repo.updateApplicationCase(actor,id,intent);
      const second = await repo.updateApplicationCase(actor,id,patch({expectedVersion:first.version}));
      const beforeReplay = await snapshot();
      expect(await repo.updateApplicationCase(actor,id,intent)).toEqual(first);
      expect(await repo.getApplicationCaseSaveResult(actor,id,intent.requestId!)).toEqual(first);
      expect(await snapshot()).toEqual(beforeReplay);
      expect(beforeReplay.tasks[0].context.caseVersion).toBe(second.version);
    });
    it("reusing a reference with different fields is rejected without a second write", async () => {
      const intent = patch();
      await repo.updateApplicationCase(actor,id,intent);
      const before = await snapshot();
      await expect(repo.updateApplicationCase(actor,id,{...intent,note:"Changed intent"})).rejects.toThrow("APPLICATION_CASE_REQUEST_MISMATCH");
      expect(await snapshot()).toEqual(before);
    });
    it("readback is actor and application scoped, and never writes", async () => {
      const intent = patch(), saved = await repo.updateApplicationCase(actor,id,intent);
      const before = await snapshot();
      expect(await repo.getApplicationCaseSaveResult(actor,id,intent.requestId!)).toEqual(saved);
      expect(await repo.getApplicationCaseSaveResult({...actor,profileId:"another-staff"},id,intent.requestId!)).toBeNull();
      expect(await repo.getApplicationCaseSaveResult(actor,randomUUID(),intent.requestId!)).toBeNull();
      expect(await repo.getApplicationCaseSaveResult(actor,id,randomUUID())).toBeNull();
      await expect(repo.getApplicationCaseSaveResult({kind:"member",profileId:"synthetic-member",userId:"member-auth"},id,intent.requestId!)).rejects.toThrow();
      await expect(repo.updateApplicationCase({kind:"member",profileId:"synthetic-member",userId:"member-auth"},id,patch())).rejects.toThrow();
      expect(await snapshot()).toEqual(before);
    });
    it("two distinct tab requests have one winner and one conflict", async () => {
      const before = await snapshot();
      const results = await Promise.allSettled([repo.updateApplicationCase(actor,id,patch()),repo.updateApplicationCase(actor,id,patch())]);
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      const loser = results.find(r => r.status === "rejected");
      expect(loser?.status === "rejected" && String(loser.reason)).toContain("APPLICATION_CASE_VERSION_CONFLICT");
      const after = await snapshot();
      expect(after.app).toEqual(before.app);
      expect(after.tasks).toHaveLength(1);
      expect(after.audits).toHaveLength(1);
    });
    it.each(["task", "audit", "existing-task-audit"] as const)("%s failure rolls back both writes and case version", async (failure) => {
      const previous = failure === "existing-task-audit" ? await repo.updateApplicationCase(actor,id,patch()) : null;
      const before = await snapshot();
      await expect(repo.updateApplicationCase(actor,id,patch(failure === "task"
        ? {nextActionCode:"contact_applicant"} : {note:"SYNTHETIC_AUDIT_FAILURE",expectedVersion:previous?.version ?? "0"}))).rejects.toMatchObject({cause:{code:"23514"}});
      expect(await snapshot()).toEqual(before);
    });
  },
);
