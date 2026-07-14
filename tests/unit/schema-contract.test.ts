import {describe, expect, it} from "vitest";

import {
  auditEvents,
  companies,
  companyMembers,
  jobs,
  membershipApplications,
  membershipPlans,
  memberships,
  profiles,
  seatInvitations,
} from "@/lib/db/schema";

describe("membership schema contract", () => {
  it("defines all M1 application tables", () => {
    expect(profiles).toBeDefined();
    expect(companies).toBeDefined();
    expect(companyMembers).toBeDefined();
    expect(seatInvitations).toBeDefined();
    expect(membershipPlans).toBeDefined();
    expect(membershipApplications).toBeDefined();
    expect(memberships).toBeDefined();
    expect(jobs).toBeDefined();
    expect(auditEvents).toBeDefined();
  });

  it("defines one unique idempotency key for webhook jobs", () => {
    expect(jobs.runKey).toBeDefined();
  });

  it("exposes company and member columns for scoped uniqueness", () => {
    expect(companyMembers.companyId).toBeDefined();
    expect(companyMembers.userId).toBeDefined();
    expect(memberships.companyId).toBeDefined();
    expect(memberships.ownerUserId).toBeDefined();
    expect(membershipPlans.code).toBeDefined();
  });
});
