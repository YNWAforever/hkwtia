import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import {insertFiniteGrant} from "@/lib/db/repos/membership-grants";

// Round 30 (Phase E follow-up): a membership granted by a superadmin is active at once, but the
// contact linked to that profile stayed in the lead funnel — only the Stripe webhook and free
// onboarding moved it to `member`. The grant now moves it inside its own transaction, under a
// savepoint, so the stage commits or rolls back with the grant and a flip failure never blocks it.
const dialect = new PgDialect();
const superadmin = {kind: "superadmin", userId: "root", profileId: "root"} as const;
const profileGrant = {target: {kind: "profile", profileId: "p-1"}, planCode: "startup", effectiveAt: "2026-10-01T00:00:00.000Z", expiresAt: "2027-10-01T00:00:00.000Z", reason: "Approved partner scholarship"} as const;
const companyGrant = {...profileGrant, target: {kind: "company", companyId: "11111111-1111-4111-8111-111111111111"}} as const;

function fakeTx(options: {flipFails?: boolean; moved?: boolean} = {}) {
  const statements: string[] = [];
  const execute = vi.fn(async (query: never) => {
    const compiled = dialect.sqlToQuery(query);
    const text = compiled.sql.replace(/\s+/g, " ").trim().toLowerCase();
    // Values such as the activity kind travel as parameters, so record them beside the SQL.
    statements.push(`${text} -- ${JSON.stringify(compiled.params)}`);
    if (text.includes("from \"profiles\"") || text.includes("from \"companies\"")) return [{id: "target"}];
    if (text.includes("from \"memberships\"") && text.includes("for update")) return [];
    if (text.includes("from \"membership_plans\"")) return [{seatAllowance: 5}];
    if (text.startsWith("insert into \"memberships\"")) return [{id: "33333333-3333-4333-8333-333333333333"}];
    if (text.startsWith("update \"contacts\"")) {
      if (options.flipFails) throw new Error("flip exploded");
      return options.moved === false ? [] : [{id: "44444444-4444-4444-8444-444444444444", previous_stage: "applied"}];
    }
    return [];
  });
  return {statements, tx: {execute}};
}

describe("a granted membership moves the linked lead to member", () => {
  it("flips the profile's contact inside the grant transaction, under a savepoint, with activity and audit", async () => {
    const {statements, tx} = fakeTx();
    const id = await insertFiniteGrant(tx as never, superadmin, profileGrant as never);
    expect(id).toBe("33333333-3333-4333-8333-333333333333");
    const at = (needle: string) => statements.findIndex((s) => s.includes(needle));
    const grantInsert = at("insert into \"memberships\"");
    const savepoint = at("savepoint grant_contact_flip");
    const flip = at("update \"contacts\"");
    expect(grantInsert).toBeGreaterThanOrEqual(0);
    expect(savepoint).toBeGreaterThan(grantInsert);
    expect(flip).toBeGreaterThan(savepoint);
    expect(statements[flip]).toContain("profile_id = $");
    expect(statements[flip]).toContain("in ('new', 'contacted', 'qualified', 'applied')");
    expect(statements.some((s) => s.includes("became_member"))).toBe(true);
    expect(statements.some((s) => s.includes("contact.became_member"))).toBe(true);
    expect(statements.some((s) => s.includes("release savepoint grant_contact_flip"))).toBe(true);
  });

  it("writes no activity when no contact moved", async () => {
    const {statements, tx} = fakeTx({moved: false});
    await insertFiniteGrant(tx as never, superadmin, profileGrant as never);
    expect(statements.some((s) => s.includes("became_member"))).toBe(false);
  });

  it("never blocks the grant when the flip fails — rolls back to the savepoint and still returns the grant", async () => {
    const {statements, tx} = fakeTx({flipFails: true});
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(insertFiniteGrant(tx as never, superadmin, profileGrant as never)).resolves.toBe("33333333-3333-4333-8333-333333333333");
    expect(statements.some((s) => s.includes("rollback to savepoint grant_contact_flip"))).toBe(true);
    expect(error).toHaveBeenCalledWith("contact.member_flip_failed", {membershipId: "33333333-3333-4333-8333-333333333333"});
    error.mockRestore();
  });

  it("does not touch contacts for a company grant (no single profile to match)", async () => {
    const {statements, tx} = fakeTx();
    await insertFiniteGrant(tx as never, superadmin, companyGrant as never, true);
    expect(statements.some((s) => s.startsWith("update \"contacts\""))).toBe(false);
  });
});
