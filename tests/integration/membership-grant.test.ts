import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {sql} from "drizzle-orm";
import {isolatedBatchDatabase} from "./admin-batch-fixture";
import {grantMembership} from "@/lib/db/repos/membership-grants";
import {expireFiniteGrants} from "@/lib/db/repos/membership-grant-expiry";
import {membershipGrantValiditySql} from "@/lib/membership/grant-sql";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const actor = {kind: "superadmin", userId: "root", profileId: "root"} as const;
let fixture: Awaited<ReturnType<typeof isolatedBatchDatabase>>;
function resultRows(value: unknown): unknown[] {return value && typeof value === "object" && "rows" in value && Array.isArray(value.rows) ? value.rows : Array.isArray(value) ? value : [];}
function input(profileId: string) {return {target: {kind: "profile", profileId}, planCode: "corporate", effectiveAt: "2026-10-01T00:00:00.000Z", expiresAt: "2026-11-01T00:00:00.000Z", reason: "Approved test scholarship"};}

describe.skipIf(!enabled)("finite membership grants on disposable PostgreSQL", () => {
  beforeAll(async () => {fixture = await isolatedBatchDatabase();}, 60_000);
  afterAll(async () => {if (fixture) await fixture.close();}, 40_000);
  it("refuses an existing live membership with no grant or audit write", async () => {
    await expect(grantMembership(actor, input("a"), {enabled: true, loadDatabase: async () => fixture.database})).rejects.toThrow("MEMBERSHIP_ALREADY_EXISTS");
    const grants = await fixture.pool.query("SELECT count(*)::int AS n FROM memberships WHERE grant_reason IS NOT NULL");
    expect(grants.rows[0]?.n).toBe(0);
  });
  it("writes one reasoned finite grant, plan seats and audit, with no Stripe identity", async () => {
    const grantId = await grantMembership(actor, input("grant-c"), {enabled: true, loadDatabase: async () => fixture.database});
    const result = await fixture.pool.query("SELECT owner_user_id,company_id,plan_code,seat_limit,grant_reason,grant_effective_at,grant_expires_at,stripe_customer_id,stripe_subscription_id FROM memberships WHERE id=$1", [grantId]);
    expect(result.rows[0]).toMatchObject({owner_user_id: "grant-c", company_id: null, plan_code: "corporate", seat_limit: 12, grant_reason: "Approved test scholarship", stripe_customer_id: null, stripe_subscription_id: null});
    const audit = await fixture.pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='membership.grant.created' AND target_id=$1", [grantId]);
    expect(audit.rows[0]?.n).toBe(1);
    const before = await fixture.database.execute(sql`SELECT id FROM memberships WHERE id = ${grantId}::uuid AND ${membershipGrantValiditySql(new Date("2026-09-30T23:59:59.999Z"))}`);
    const atStart = await fixture.database.execute(sql`SELECT id FROM memberships WHERE id = ${grantId}::uuid AND ${membershipGrantValiditySql(new Date("2026-10-01T00:00:00.000Z"))}`);
    const atExpiry = await fixture.database.execute(sql`SELECT id FROM memberships WHERE id = ${grantId}::uuid AND ${membershipGrantValiditySql(new Date("2026-11-01T00:00:00.000Z"))}`);
    expect(resultRows(before)).toHaveLength(0);
    expect(resultRows(atStart)).toHaveLength(1);
    expect(resultRows(atExpiry)).toHaveLength(0);
  }, 60_000);
  it("allows only one grant when two requests race for the same profile", async () => {
    const candidate = {...input("grant-d"), expiresAt: "2026-12-01T00:00:00.000Z"};
    const attempts = await Promise.allSettled([grantMembership(actor, candidate, {enabled: true, loadDatabase: async () => fixture.database}), grantMembership(actor, candidate, {enabled: true, loadDatabase: async () => fixture.database})]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rows = await fixture.pool.query("SELECT count(*)::int AS n FROM memberships WHERE owner_user_id='grant-d'");
    expect(rows.rows[0]?.n).toBe(1);
    const audits = await fixture.pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='membership.grant.created' AND metadata->>'targetId'='grant-d'");
    expect(audits.rows[0]?.n).toBe(1);
  }, 60_000);
  it("supports explicitly enabled company grants with catalog seats and one atomic audit", async () => {
    const companyId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await fixture.pool.query("INSERT INTO companies (id,display_name) VALUES ($1,'Synthetic Grant Company')", [companyId]);
    const candidate = {...input("unused"), target: {kind: "company", companyId}, effectiveAt: "2040-01-01T00:00:00.000Z", expiresAt: "2041-01-01T00:00:00.000Z"};
    const attempts = await Promise.allSettled([1, 2].map(() => grantMembership(actor, candidate, {enabled: true, companyEnabled: true, loadDatabase: async () => fixture.database})));
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((result) => result.status === "rejected")).toHaveLength(1);
    const grants = await fixture.pool.query("SELECT owner_user_id,company_id,seat_limit,stripe_customer_id,stripe_subscription_id FROM memberships WHERE company_id=$1", [companyId]);
    expect(grants.rows).toEqual([{owner_user_id: null, company_id: companyId, seat_limit: 12, stripe_customer_id: null, stripe_subscription_id: null}]);
    expect((await fixture.pool.query("SELECT metadata->>'targetKind' AS kind FROM audit_events WHERE metadata->>'targetId'=$1", [companyId])).rows).toEqual([{kind: "company"}]);
  }, 60_000);

  it("refuses a nonexistent company even with its capability explicitly enabled", async () => {
    await expect(grantMembership(actor, {...input("unused"), target: {kind: "company", companyId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd"}}, {enabled: true, companyEnabled: true, loadDatabase: async () => fixture.database})).rejects.toThrow("GRANT_COMPANY_NOT_FOUND");
  });
  it("expires only due grant rows, never a paid membership, and audits once", async () => {
    const now = new Date("2026-11-01T00:00:00.000Z");
    expect(await expireFiniteGrants(now, {loadDatabase: async () => fixture.database})).toBe(1);
    expect(await expireFiniteGrants(now, {loadDatabase: async () => fixture.database})).toBe(0);
    const grant = await fixture.pool.query("SELECT status FROM memberships WHERE owner_user_id='grant-c'");
    const paid = await fixture.pool.query("SELECT status FROM memberships WHERE owner_user_id='a'");
    expect(grant.rows[0]?.status).toBe("expired");
    expect(paid.rows[0]?.status).toBe("active");
    const audit = await fixture.pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='membership.grant.expired'");
    expect(audit.rows[0]?.n).toBe(1);
  }, 60_000);

});
