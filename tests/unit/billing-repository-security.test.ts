import {drizzle} from "drizzle-orm/pg-proxy";
import {beforeEach, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));

vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {billingAttemptsRepository} from "@/lib/db/repos/billing-attempts";
import {membershipsRepository} from "@/lib/db/repos/memberships";

const actor = {kind: "member", userId: "user-a", profileId: "user-a"} as const;
const membershipId = "20000000-0000-4000-8000-000000000002";
const attemptId = "30000000-0000-4000-8000-000000000003";
const now = new Date("2026-01-01T00:00:00.000Z");

const attemptRow = () => [
  attemptId, membershipId, 1, `membership-checkout:${membershipId}:1`, "price_startup_v1", "active",
  null, null, now, now, null,
];

const personalMembershipRow = [
  membershipId, "user-a", null, "application-a", "startup", "active", 5,
  "cus_personal", "sub_personal", null, null, false, now, now,
];
const companyMembershipRow = [
  membershipId, null, "company-a", "application-a", "corporate", "active", 25,
  "cus_company", "sub_company", null, null, false, now, now,
];

describe("checkout billing attempt persistence", () => {
  beforeEach(() => { database.current = null; });

  it("persists and returns the Checkout Session reference for recovery", async () => {
    const statements: string[] = [];
    database.current = drizzle(async (query) => {
      statements.push(query);
      return {rows: [[...attemptRow().slice(0, 6), "cs_1", "https://checkout.stripe.test/cs_1", ...attemptRow().slice(8)]]};
    });

    const attempt = await billingAttemptsRepository.attachSession(actor, attemptId, {
      stripeCheckoutSessionId: "cs_1",
      checkoutUrl: "https://checkout.stripe.test/cs_1",
    });

    expect(attempt).toMatchObject({stripeCheckoutSessionId: "cs_1", checkoutUrl: "https://checkout.stripe.test/cs_1"});
    expect(statements[0].toLowerCase()).toContain("update");
  });
});

describe("database-backed billing manager authorization", () => {
  beforeEach(() => { database.current = null; });

  it("preserves personal-owner billing access", async () => {
    database.current = drizzle(async () => ({rows: [personalMembershipRow]}));
    await expect(membershipsRepository.getBillingAccess(actor, membershipId)).resolves.toMatchObject({ownerUserId: "user-a"});
  });

  it.each(["owner", "admin"] as const)("allows an active company %s using trusted company_members", async () => {
    const statements: string[] = [];
    const parameters: unknown[][] = [];
    database.current = drizzle(async (query, params) => {
      statements.push(query);
      parameters.push(params);
      return {rows: [companyMembershipRow]};
    });

    await expect(membershipsRepository.getBillingAccess(actor, membershipId)).resolves.toMatchObject({companyId: "company-a"});
    const sql = statements.join("\n").toLowerCase();
    expect(sql).toContain('from "company_members"');
    expect(sql).toContain('"revoked_at"');
    expect(parameters.flat()).toEqual(expect.arrayContaining(["owner", "admin"]));
    expect(actor).not.toHaveProperty("companyRoles");
  });

  it.each(["member", "revoked"])("denies a company %s when the trusted role scope returns no row", async () => {
    database.current = drizzle(async () => ({rows: []}));
    await expect(membershipsRepository.getBillingAccess(actor, membershipId)).rejects.toThrow("FORBIDDEN");
  });
});
