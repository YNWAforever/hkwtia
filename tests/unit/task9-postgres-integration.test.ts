import {execFileSync, spawn, type ChildProcessWithoutNullStreams} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";

import {drizzle} from "drizzle-orm/pg-proxy";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {createApprovalsRepository} from "@/lib/db/repos/approvals";
import type {AdminActor} from "@/lib/membership/lifecycle";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = `hkwtia-task9-${process.pid}`;
const approvalId = "11111111-1111-4111-8111-111111111111";
const rollbackApprovalId = "22222222-2222-4222-8222-222222222222";
const staff: AdminActor = {kind: "staff", userId: "auth-staff", profileId: "staff-profile"};

function docker(args: string[], input?: string): string {
  return execFileSync("docker", args, {encoding: "utf8", input, timeout: 20_000, stdio: [input ? "pipe" : "ignore", "pipe", "pipe"]});
}
function psql(sql: string): string {
  return docker(["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-At"], sql);
}
async function waitForPostgres(): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { docker(["exec", container, "pg_isready", "-U", "postgres"]); return; } catch { await delay(100); }
  }
  throw new Error("isolated Postgres did not become ready");
}
function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Date) return `'${value.toISOString()}'::timestamptz`;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${String(value).replaceAll("'", "''")}'`;
}
function bindParams(query: string, params: readonly unknown[]): string {
  let bound = query;
  for (let index = params.length - 1; index >= 0; index -= 1) bound = bound.replaceAll(`$${index + 1}`, sqlLiteral(params[index]));
  return bound;
}
function csvFields(line: string): string[] {
  const fields: string[] = []; let value = ""; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') { if (quoted && line[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted; }
    else if (char === "," && !quoted) { fields.push(value); value = ""; } else value += char;
  }
  fields.push(value); return fields;
}
function parseCsv(output: string): Record<string, unknown>[] {
  const lines = output.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = csvFields(lines[0]!);
  return lines.slice(1).map((line) => Object.fromEntries(csvFields(line).map((value, index) => [headers[index], value === "__NULL__" ? null : value === "t" ? true : value === "f" ? false : value])));
}
function oneShotRows(query: string, params: readonly unknown[]): Record<string, unknown>[] {
  return parseCsv(docker(["exec", "-i", container, "psql", "-X", "-q", "--csv", "-P", "footer=off", "-P", "null=__NULL__", "-v", "ON_ERROR_STOP=1", "-U", "postgres"], bindParams(query, params)));
}

class PsqlSession {
  private readonly child: ChildProcessWithoutNullStreams;
  private stdout = ""; private stderr = ""; private counter = 0;
  constructor() {
    this.child = spawn("docker", ["exec", "-i", container, "psql", "-X", "-q", "--csv", "-P", "footer=off", "-P", "null=__NULL__", "-v", "ON_ERROR_STOP=1", "-U", "postgres"], {stdio: ["pipe", "pipe", "pipe"]});
    this.child.stdout.setEncoding("utf8"); this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => { this.stdout += chunk; });
    this.child.stderr.on("data", (chunk: string) => { this.stderr += chunk; });
  }
  async query(query: string, params: readonly unknown[] = []): Promise<Record<string, unknown>[]> {
    const marker = `__TASK9_END_${++this.counter}__`;
    this.child.stdin.write(bindParams(query, params) + `;\n\\echo ${marker}\n`);
    const deadline = Date.now() + 15_000;
    while (!this.stdout.includes(marker)) {
      if (this.child.exitCode !== null) throw new Error(`psql session exited (${this.child.exitCode}): ${this.stderr}`);
      if (Date.now() > deadline) { this.child.kill(); throw new Error(`psql query timed out: ${this.stderr}`); }
      await delay(10);
    }
    const index = this.stdout.indexOf(marker); const output = this.stdout.slice(0, index).trim();
    this.stdout = this.stdout.slice(index + marker.length).replace(/^\r?\n/, "");
    return parseCsv(output);
  }
  async close(): Promise<void> {
    if (this.child.exitCode !== null) return;
    this.child.stdin.end(); const deadline = Date.now() + 5_000;
    while (this.child.exitCode === null && Date.now() < deadline) await delay(10);
    if (this.child.exitCode === null) this.child.kill();
  }
}

function createRepositoryDatabase() {
  const oneShot = drizzle(async (query, params, method) => {
    const rows = oneShotRows(query, params);
    return {rows: method === "all" ? rows.map(Object.values) : rows};
  });
  return Object.assign(oneShot, {async transaction<T>(work: (tx: ReturnType<typeof drizzle>) => Promise<T>) {
    const session = new PsqlSession();
    const proxy = drizzle(async (query, params, method) => {
      const rows = await session.query(query, params);
      return {rows: method === "all" ? rows.map(Object.values) : rows};
    });
    await session.query("BEGIN");
    try { const result = await work(proxy); await session.query("COMMIT"); return result; }
    catch (error) { try { await session.query("ROLLBACK"); } catch { /* ON_ERROR_STOP can close a failed session. */ } throw error; }
    finally { await session.close(); }
  }});
}

describe.skipIf(!enabled)("Task 9 approval decisions on isolated Postgres 16", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "postgres:16-alpine"]);
    await waitForPostgres();
    psql(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE TYPE approval_status AS ENUM ('pending','approved','rejected','expired');
      CREATE TABLE approvals (id uuid PRIMARY KEY, action_type text NOT NULL, payload jsonb NOT NULL, status approval_status NOT NULL DEFAULT 'pending', requested_by_profile_id text, requested_at timestamptz NOT NULL DEFAULT now(), decided_by_profile_id text, decided_at timestamptz);
      CREATE TABLE audit_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id text, actor_type text NOT NULL, action text NOT NULL, target_type text NOT NULL, target_id text NOT NULL, request_id text, metadata jsonb, created_at timestamptz NOT NULL DEFAULT now());
      INSERT INTO approvals (id, action_type, payload) VALUES
        ('${approvalId}','campaign.send','{"campaignId":"campaign-1","email":"private@example.test"}'),
        ('${rollbackApprovalId}','event.publish','{"eventId":"event-1"}');
    `);
  }, 90_000);
  afterAll(() => { try { docker(["rm", "-f", container]); } catch { /* Container may already be gone. */ } });

  it("permits exactly one concurrent decision with one audit and rolls back a decision when audit insertion fails", async () => {
    const database = createRepositoryDatabase();
    const repository = createApprovalsRepository(async () => database as never);
    const results = await Promise.allSettled([
      repository.decide(staff, {approvalId, decision: "approved"}),
      repository.decide(staff, {approvalId, decision: "rejected"}),
    ]);
    expect(results.filter(({status}) => status === "fulfilled")).toHaveLength(1);
    const failure = results.find(({status}) => status === "rejected");
    expect(failure).toMatchObject({status: "rejected", reason: expect.objectContaining({message: "APPROVAL_ALREADY_DECIDED"})});
    expect(psql(`SELECT status || '|' || decided_by_profile_id || '|' || (SELECT count(*) FROM audit_events WHERE target_id='${approvalId}') FROM approvals WHERE id='${approvalId}';`).trim())
      .toMatch(/^(approved|rejected)\|staff-profile\|1$/);

    psql(`ALTER TABLE audit_events ADD CONSTRAINT task9_fail_second_audit CHECK (target_id <> '${rollbackApprovalId}');`);
    await expect(repository.decide(staff, {approvalId: rollbackApprovalId, decision: "approved"})).rejects.toThrow();
    expect(psql(`SELECT status || '|' || coalesce(decided_by_profile_id,'') || '|' || (SELECT count(*) FROM audit_events WHERE target_id='${rollbackApprovalId}') FROM approvals WHERE id='${rollbackApprovalId}';`).trim()).toBe("pending||0");
  }, 30_000);
});
