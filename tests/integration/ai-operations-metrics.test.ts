// @vitest-environment node
import {randomUUID} from "node:crypto";
import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {assertIsolatedSeedEnvironment, assertSeedSentinel} from "@/scripts/lib/acceptance-guard";
import {createOperationsMetricsRepository} from "@/lib/db/repos/operations-metrics";
const staff = {kind: "staff", profileId: "m2-staff-01", userId: "synthetic-staff"} as const;
const member = {kind: "member", profileId: "m2-risk-01", userId: "synthetic-member"} as const;
const source = randomUUID(), caseId = randomUUID(), observationId = randomUUID();
const rejectedIds: string[] = [];
const now = new Date(), endedAt = new Date(now.getTime() - 60_000), startedAt = new Date(endedAt.getTime() - 600_000);
const input = {observationId, caseId, caseKind: "support" as const, auditId: source, runId: null,
  startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString(), humanMinutes: 4, reviewMinutes: 2,
  reworkMinutes: 1, waitMinutes: 3, decision: "edited" as const, reopened: false,
  cohort: "baseline" as const, comparisonId: randomUUID()};
let pool: Pool, repo: ReturnType<typeof createOperationsMetricsRepository>;
describe.skipIf(process.env.FULL_REMEDIATION_ACCEPTANCE_SEED !== "true")("actual isolated administrative work observations", () => {
  beforeAll(async () => {
    const url = assertIsolatedSeedEnvironment(process.env, {prefix: "FULL_REMEDIATION", flag: "FULL_REMEDIATION_ACCEPTANCE_SEED", hostAllowlistVar: "FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST"});
    if (new URL(url).hostname !== "ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech" || process.env.NEON_PROJECT_ID !== "solitary-wave-52860119") throw Error("UNCONFIRMED_ISOLATED_TARGET");
    pool = new Pool({connectionString: url});
    await assertSeedSentinel("FULL_REMEDIATION", async () => Number((await pool.query("SELECT count(*) AS count FROM acceptance_sentinel")).rows[0].count));
    await pool.query("INSERT INTO audit_events(id,actor_user_id,actor_type,action,target_type,target_id) VALUES($1,$2,'staff','synthetic_work_source','conversation',$3)", [source, staff.profileId, caseId]);
    repo = createOperationsMetricsRepository(async () => drizzle(pool));
  });
  afterAll(async () => {if (pool) {await pool.query("DELETE FROM audit_events WHERE id=$1 OR (target_type='admin_operation' AND target_id=ANY($2::text[]))", [source, [observationId, ...rejectedIds]]); await pool.end();}});
  it("records one content-free audit receipt despite concurrent duplicate submissions", async () => {
    await Promise.all([repo.record(staff, input, now), repo.record(staff, input, now)]);
    const rows = (await pool.query("SELECT actor_user_id,actor_type,metadata FROM audit_events WHERE target_type='admin_operation' AND target_id=$1", [observationId])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({actor_user_id: staff.profileId, actor_type: "staff", metadata: {version: 1, observation: input}});
    expect(JSON.stringify(rows)).not.toMatch(/body|email|cookie|token/);
  });
  it("rejects conflicting receipts and source references without altering the original", async () => {
    await expect(repo.record(staff, {...input, decision: "rejected"}, now)).rejects.toThrow("OPERATION_OBSERVATION_CONFLICT");
    await expect(repo.record(staff, {...input, observationId: randomUUID(), caseId: randomUUID()}, now)).rejects.toThrow("OPERATION_SOURCE_MISMATCH");
  });
  it("rejects overlapping work for the same staff and case before inflating the timing sample", async () => {
    const duplicate = randomUUID();rejectedIds.push(duplicate);
    await expect(repo.record(staff, {...input, observationId: duplicate}, now)).rejects.toThrow("OPERATION_TIMING_OVERLAP");
  });
  it("attributes work to the observation period rather than the later receipt timestamp", async () => {
    const receiptOnly = await repo.read(staff, {from: new Date(now.getTime() - 1000), toExclusive: new Date(now.getTime() + 1000)});
    expect(receiptOnly.sampleCount).toBe(0);
  });
  it("reports observed case counts without inventing a measured saving", async () => {
    const summary = await repo.read(staff, {from: new Date(startedAt.getTime() - 1000), toExclusive: new Date(endedAt.getTime() + 1000)});
    expect(summary).toMatchObject({status: "baseline_collecting", sampleCount: 1, netMinutes: null,
      humanMinutes: 4, reviewMinutes: 2, reworkMinutes: 1, waitMinutes: 3});
    expect(summary.caseCount).toBeGreaterThanOrEqual(1);
    expect(summary.missingRate).toBeGreaterThanOrEqual(0);
    expect(summary.missingRate).toBeLessThanOrEqual(1);
    await expect(repo.read(member, {from: startedAt, toExclusive: now})).rejects.toThrow("FORBIDDEN");
  });
  it("rejects a member before loading SQL", async () => {
    let reads = 0;
    const guarded = createOperationsMetricsRepository(async () => {reads++;return drizzle(pool);});
    await expect(guarded.record(member, input, now)).rejects.toThrow("FORBIDDEN");
    expect(reads).toBe(0);
  });
});
