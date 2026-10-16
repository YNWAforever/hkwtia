// @vitest-environment node
import {randomUUID} from "node:crypto";
import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {assertIsolatedSeedEnvironment, assertSeedSentinel} from "@/scripts/lib/acceptance-guard";
import {createOperationsMetricsRepository} from "@/lib/db/repos/operations-metrics";
const staff = {kind: "staff", profileId: "m2-staff-01", userId: "synthetic-staff"} as const;
const member = {kind: "member", profileId: "m2-risk-01", userId: "synthetic-member"} as const;
const comparisonId = randomUUID(), caseId = randomUUID(), source = randomUUID();
const window = {comparisonId, from: "2026-08-01T00:00:00.000Z", toExclusive: "2026-08-15T00:00:00.000Z"};
const now = new Date("2026-08-16T00:00:00.000Z");
const ids: string[] = [];
let pool: Pool, repo: ReturnType<typeof createOperationsMetricsRepository>;
function observation(day: number, minutes: number, cohort: "baseline" | "assisted" = "baseline") {
 const id = randomUUID();ids.push(id);
 const start = new Date(Date.parse("2026-08-01T00:00:00.000Z") + day * 86400000);
 return {observationId: id, comparisonId, caseId, caseKind: "support" as const, auditId: source, runId: null,
 startedAt: start.toISOString(), endedAt: new Date(start.getTime() + minutes * 60000).toISOString(), humanMinutes: minutes,
 reviewMinutes: 0, reworkMinutes: 0, waitMinutes: 0, decision: "manual" as const, reopened: day > 1, cohort};
}
describe.skipIf(process.env.FULL_REMEDIATION_ACCEPTANCE_SEED !== "true")("actual isolated immutable timing baseline", () => {
 beforeAll(async () => {
  const url = assertIsolatedSeedEnvironment(process.env, {prefix: "FULL_REMEDIATION", flag: "FULL_REMEDIATION_ACCEPTANCE_SEED", hostAllowlistVar: "FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST"});
  if (new URL(url).hostname !== "ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech" || process.env.NEON_PROJECT_ID !== "solitary-wave-52860119") throw Error("UNCONFIRMED_ISOLATED_TARGET");
  pool = new Pool({connectionString: url});
  await assertSeedSentinel("FULL_REMEDIATION", async () => Number((await pool.query("SELECT count(*) AS count FROM acceptance_sentinel")).rows[0].count));
  await pool.query("INSERT INTO audit_events(id,actor_user_id,actor_type,action,target_type,target_id) VALUES($1,$2,'staff','synthetic_baseline_source','conversation',$3)", [source, staff.profileId, caseId]);
  repo = createOperationsMetricsRepository(async () => drizzle(pool));
  await repo.record(staff, observation(1, 10), now);
  await repo.record(staff, observation(5, 6), now);
 });
 afterAll(async () => {if (pool) {
  await pool.query("DELETE FROM audit_events WHERE id=$1 OR (target_type='admin_operation' AND target_id=ANY($2::text[])) OR (target_type='admin_operation_baseline' AND target_id=$3)", [source, ids, comparisonId]);
  await pool.end();
 }});
 it("freezes one server-derived digest despite concurrent submission and refuses edits", async () => {
  const [first, second] = await Promise.all([repo.freezeBaseline(staff, window, now), repo.freezeBaseline(staff, window, now)]);
  expect(first).toEqual(second);
  expect(first.means).toEqual([{caseKind: "support", sampleCount: 1, minutesPerCase: 16}]);
  const records = (await pool.query("SELECT actor_user_id,metadata FROM audit_events WHERE target_type='admin_operation_baseline' AND target_id=$1", [comparisonId])).rows;
  expect(records).toHaveLength(1);
  expect(records[0].actor_user_id).toBe(staff.profileId);
  expect(records[0].metadata.receiptDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(records)).not.toMatch(/body|email|cookie|token/);
  await expect(repo.freezeBaseline(staff, {...window, from: "2026-07-31T00:00:00.000Z"}, now)).rejects.toThrow("OPERATION_BASELINE_CONFLICT");
 });
 it("blocks late manual samples and only compares post-baseline assisted work", async () => {
  await expect(repo.record(staff, observation(10, 1), now)).rejects.toThrow("OPERATION_BASELINE_FROZEN");
  await repo.record(staff, observation(14, 20, "assisted"), now);
  const report = await repo.read(staff, {from: new Date("2026-08-14T00:00:00.000Z"), toExclusive: new Date("2026-08-17T00:00:00.000Z")});
  // The receipt timestamp is fixed to Aug 16 in this synthetic run; the manual snapshot stays immutable.
  expect(report).toMatchObject({netMinutes: -4, comparisonSampleCount: 1});
 });
 it("requires a completed period and authorization before any SQL", async () => {
  let reads = 0;
  const guarded = createOperationsMetricsRepository(async () => {reads++;return drizzle(pool);});
  await expect(guarded.freezeBaseline(member, window, now)).rejects.toThrow("FORBIDDEN");
  expect(reads).toBe(0);
  await expect(repo.freezeBaseline(staff, {...window, comparisonId: randomUUID(), toExclusive: "2026-08-18T00:00:00.000Z"}, now)).rejects.toThrow("OPERATION_BASELINE_INVALID");
 });
});
