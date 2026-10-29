import {getTableColumns} from "drizzle-orm";
import {drizzle} from "drizzle-orm/pg-proxy";
import {beforeEach, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));
vi.mock("@/lib/db/repos/common", async (original) => ({
  ...await original<typeof import("@/lib/db/repos/common")>(),
  getDb: async () => database.current,
}));

import {applicationsRepository} from "@/lib/db/repos/applications";
import {createJoinInvitesRepository} from "@/lib/db/repos/join-invites";
import {membershipApplications} from "@/lib/db/server-schema";
import {startJoin} from "@/lib/membership/join-service";

const member = {kind: "member", userId: "auth-a", profileId: "member-a"} as const;
const staff = {kind: "staff", userId: "auth-staff", profileId: "staff-a"} as const;
const applicationId = "11111111-1111-4111-8111-111111111111";
const contactId = "22222222-2222-4222-8222-222222222222";
const now = "2026-10-29T00:00:00.000Z";

/** Drive real repository SQL, enforcing the plan FK on an initially unseeded ops catalog. */
function unseededCatalog() {
  const plans = new Set(["community", "startup", "corporate", "patron"]);
  const planWrites: unknown[][] = [];
  const proxy = drizzle(async (query, params) => {
    if (/insert into "membership_plans"/i.test(query)) {
      plans.add(String(params[0]));
      planWrites.push(params);
      return {rows: []};
    }
    if (/insert into "membership_applications"/i.test(query)) {
      const plan = params.find((value) => value === "individual" || value === "platinum");
      if (!plans.has(String(plan))) throw new Error("membership_applications_plan_code_fkey");
      const row: Record<string, unknown> = {
        id: applicationId, applicantUserId: member.profileId, companyId: null,
        planCode: plan, currentStep: "profile", status: "draft", inviteId: null,
        utmSource: null, utmMedium: null, utmCampaign: null, utmTerm: null, utmContent: null,
        referralCode: null, referrerHost: null, landingPath: null, heardAbout: null, attributionCapturedAt: null,
        createdAt: now, updatedAt: now,
      };
      return {rows: [Object.keys(getTableColumns(membershipApplications)).map((key) => row[key])]};
    }
    if (/insert into "join_invites"/i.test(query)) {
      const plan = params[1];
      if (!plans.has(String(plan))) throw new Error("join_invites_plan_code_fkey");
      return {rows: [{
        id: applicationId, contact_id: contactId, plan_code: plan,
        created_by_profile_id: staff.profileId, expires_at: now, opened_at: null,
        consumed_at: null, superseded_at: null, application_id: null, created_at: now,
      }]};
    }
    if (/from "contacts"/i.test(query)) return {rows: [{id: contactId}]};
    return {rows: []};
  });
  // pg-proxy has no transaction support; run the real callback over the same recorder.
  const db = Object.assign(proxy, {
    transaction: async <T,>(work: (tx: typeof proxy) => Promise<T>) => work(proxy),
  });
  database.current = db;
  return {db, plans, planWrites};
}

describe("new pay-first plan catalog bootstrap", () => {
  beforeEach(() => {database.current = null;});

  it.each(["individual", "platinum"] as const)("starts the first public %s join without a preseeded plan row", async (plan) => {
    const catalog = unseededCatalog();
    await expect(startJoin(member, {plan}, {applications: {
      getById: applicationsRepository.getById,
      update: applicationsRepository.update,
      resumeOrCreate: applicationsRepository.resumeOrCreate,
      create: async () => {throw new Error("Public joins must use resumeOrCreate");},
    }}))
      .resolves.toEqual({applicationId, next: "profile"});
    expect(catalog.plans.has(plan)).toBe(true);
    expect(catalog.planWrites).toHaveLength(1);
    expect(catalog.planWrites[0]).toContain(plan === "individual" ? 500 : 4800);
    expect(catalog.planWrites[0]).toContain(plan === "individual" ? 1 : 25);
  });

  it.each(["individual", "platinum"] as const)("can issue the first %s lead invite before any join", async (plan) => {
    const catalog = unseededCatalog();
    const invites = createJoinInvitesRepository(async () => catalog.db as never);
    await expect(invites.create(staff, {contactId, planCode: plan}))
      .resolves.toMatchObject({invite: {planCode: plan}});
    expect(catalog.plans.has(plan)).toBe(true);
  });

  it.each(["individual", "platinum"] as const)("retains bootstrap for direct %s application creation", async (planCode) => {
    const catalog = unseededCatalog();
    await expect(applicationsRepository.create(member, {planCode}))
      .resolves.toMatchObject({planCode});
    expect(catalog.plans.has(planCode)).toBe(true);
  });
});
