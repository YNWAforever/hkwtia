import {drizzle} from "drizzle-orm/pg-proxy";
import {beforeEach, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));

vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {companiesRepository, type CompanyUpdate} from "@/lib/db/repos/companies";
import {createApprovalsRepository} from "@/lib/db/repos/approvals";
import {createAgentRunsRepository} from "@/lib/db/repos/agent-runs";
import {createConversationsRepository} from "@/lib/db/repos/conversations";
import {createInboxRepository} from "@/lib/db/repos/inbox";
import {createStaffTasksRepository} from "@/lib/db/repos/staff-tasks";
import {membershipsRepository} from "@/lib/db/repos/memberships";
import {profilesRepository} from "@/lib/db/repos/profiles";
import {createWoztellDeliveryStampRepository} from "@/lib/db/repos/woztell-delivery-stamp";
import {createWoztellInboundEventsRepository} from "@/lib/db/repos/woztell-inbound-events";
import {ANONYMOUS_ACTOR, type Actor} from "@/lib/membership/lifecycle";
import type {ConciergeAgentActor} from "@/lib/auth/agent-actor";

const actor = {kind: "member", userId: "user-a", profileId: "user-a"} as const;
const forgedUnsubscribeActor = {
  kind: "system",
  userId: null,
  source: "unsubscribe",
} as unknown as Actor;
const agent: ConciergeAgentActor = {
  kind: "agent",
  agent: "concierge",
  runId: "22222222-2222-4222-8222-222222222222",
  conversationId: "11111111-1111-4111-8111-111111111111",
  profileId: "user-a",
  trigger: "web",
};

const securityNow = new Date("2027-04-10T10:00:00.000Z");
const providerMessageId = "provider-message-security";
const anonymousOwnerHash = "a".repeat(64);
const conversationProxyRow = (
  profileId: string | null,
  anonymousHash: string | null,
) => ({
  id: agent.conversationId,
  profile_id: profileId,
  anonymous_owner_hash: anonymousHash,
  locale: "en",
  status: "active",
  last_message_at: null,
  expires_at: new Date("2027-04-11T10:00:00.000Z"),
  created_at: securityNow,
  updated_at: securityNow,
});
const messageProxyRow = (disposition?: "created" | "existing") => ({
  id: "33333333-3333-4333-8333-333333333333",
  conversation_id: agent.conversationId,
  role: "user",
  channel: "web",
  content: "Hello",
  provider_message_id: providerMessageId,
  metadata: {},
  citations: [],
  created_at: securityNow,
  disposition,
});

function normalizedSql(statement: string | undefined): string {
  return (statement ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Everything an UPDATE writes, without the scope predicate or the `RETURNING` column list. */
function setClause(statement: string | undefined): string {
  const normalized = normalizedSql(statement);
  const start = normalized.indexOf(" set ");
  const end = normalized.indexOf(" where ");
  return start === -1 ? "" : normalized.slice(start, end === -1 ? undefined : end);
}

/**
 * The payload `/portal/company` really posts. `updateCompanyAction` in
 * `lib/portal/commands.ts` builds every one of these keys with
 * `String(formData.get(…))`, so not one of them is ever `undefined`: pressing
 * Save having edited nothing sends the whole row back. That is why the review
 * demotion in `lib/db/repos/companies.ts` has to compare values — counting the
 * keys an update carries would demote on every save.
 */
function portalCompanySave(overrides: CompanyUpdate = {}): CompanyUpdate {
  return {
    legalName: "Acme Limited",
    displayName: "Acme",
    website: null,
    industry: null,
    sizeBand: null,
    description: null,
    directoryVisible: false,
    ...overrides,
  };
}

/** The stored row those values were read out of, already through staff review. */
const publishedCompanyColumns = {
  public_profile_status: "published",
  display_name: "Acme",
  website: null,
  industry: null,
  size_band: null,
  description: null,
};

/**
 * A unit run has no Postgres to evaluate the demotion gate, and a no-op save and
 * a rewrite build the *same* statement — they differ only in the values bound to
 * it. So read the gate back out of the statement the repository built and apply
 * it to a stored row, which is the only way those two cases are distinguishable
 * without a database. It understands exactly the grammar `reviewResetFor` emits
 * and throws, rather than passing quietly, if that grammar changes.
 */
function demotionGate(statement: string | undefined, parameters: readonly unknown[]) {
  const clause = setClause(statement);
  const gate = /(case when (?:"[a-z_]+"\.)?"public_profile_status" = 'published' and \((.+?)\)) then 'pending_review'/.exec(clause);
  if (!gate) throw new Error(`the SET clause carries no value-compared demotion gate: ${clause}`);
  const comparisons = [...gate[2].matchAll(/(?:"[a-z_]+"\.)?"([a-z_]+)" is distinct from \$(\d+)/g)];
  if (comparisons.length === 0) throw new Error(`the demotion gate compares no column values: ${gate[2]}`);
  // Each occurrence of the gate binds its own placeholders, so compare the
  // occurrences with the numbers taken out.
  const anonymised = (text: string) => text.replace(/\$\d+/g, "?");
  return {
    /** The columns whose value the gate actually looks at. */
    columns: comparisons.map(([, column]) => column),
    /** How many SET expressions the gate protects: the status plus the reviewer columns. */
    guardedExpressions: anonymised(clause).split(anonymised(gate[1])).length - 1,
    /** What Postgres would decide for `stored`. */
    fires: (stored: Record<string, unknown>) =>
      stored.public_profile_status === "published"
      && comparisons.some(([, column, placeholder]) => stored[column] !== parameters[Number(placeholder) - 1]),
  };
}

const membershipRow = [
  "membership-a",
  null,
  "company-b",
  "application-b",
  "corporate",
  "pending_payment",
  "annual",
  10,
  null,
  null,
  null,
  null,
  false,
  new Date("2026-01-01T00:00:00.000Z"),
  new Date("2026-01-01T00:00:00.000Z"),
];

const existingProfileRow = [
  "user-a",
  "user-a",
  null,
  "member",
  null,
  false,
  [],
  "Authored Display Name",
  "+852 5555 5555",
  "Founder",
  "zh-HK",
  "company",
  true,
  new Date("2026-01-01T00:00:00.000Z"),
  new Date("2026-01-01T00:00:00.000Z"),
];

// Positional, in `companies` column order: the proxy driver hands Drizzle a
// raw tuple, so every column the table declares must be present. The tail is
// the Phase B2 public-profile block (D-11); `tags` is NOT NULL, and Drizzle
// maps it eagerly, so it has to be an array rather than null.
const companyRow = [
  "company-b",
  "Acme Limited",
  "Acme",
  null,
  null,
  null,
  null,
  null,
  false,
  new Date("2026-01-01T00:00:00.000Z"),
  new Date("2026-01-01T00:00:00.000Z"),
  null,
  null,
  [],
  null,
  null,
  null,
  "hidden",
  null,
  null,
  null,
  null,
];

const applicationRow = (overrides: {
  applicantUserId?: string;
  companyId?: string | null;
  planCode?: "community" | "startup" | "corporate" | "patron";
} = {}) => [
  overrides.applicantUserId ?? "user-a",
  overrides.companyId === undefined ? "company-b" : overrides.companyId,
  overrides.planCode ?? "corporate",
];

function companyMembershipInput(overrides: Partial<Parameters<typeof membershipsRepository.create>[1]> = {}) {
  return {
    ownerUserId: null,
    companyId: "company-b",
    applicationId: "application-b",
    planCode: "corporate" as const,
    status: "pending_payment" as const,
    seatLimit: 10,
    billingInterval: "annual" as const,
    ...overrides,
  };
}

describe("production repository security boundaries", () => {
  beforeEach(() => {
    database.current = null;
  });

  it.each([
    {
      name: "personal",
      input: {
        ownerUserId: "user-a",
        companyId: null,
        applicationId: null,
        planCode: "community",
        status: "active",
        seatLimit: 1,
        billingInterval: "none",
      } satisfies Parameters<typeof membershipsRepository.create>[1],
    },
    {
      name: "company",
      input: companyMembershipInput({applicationId: null}),
    },
  ])("denies a member-created $name membership without an application", async ({input}) => {
    const statements: string[] = [];
    database.current = drizzle(async (query) => {
      statements.push(query);
      const normalized = query.toLowerCase();
      if (normalized.includes('from "company_members"')) return {rows: [["company-b"]]};
      if (normalized.includes('insert into "memberships"')) return {rows: [membershipRow]};
      return {rows: []};
    });

    await expect(membershipsRepository.create(actor, input)).rejects.toThrow("FORBIDDEN");

    expect(statements.join("\n").toLowerCase()).not.toContain('insert into "memberships"');
  });

  it("denies a company membership when the application is outside the actor scope", async () => {
    const statements: string[] = [];
    database.current = drizzle(async (query) => {
      statements.push(query);
      const normalized = query.toLowerCase();
      if (normalized.includes('from "company_members"') && !normalized.includes('"membership_applications"')) {
        return {rows: [["company-b"]]};
      }
      if (normalized.includes("insert into \"memberships\"") && !normalized.includes(" select ")) {
        return {rows: [membershipRow]};
      }
      return {rows: []};
    });

    await expect(
      membershipsRepository.create(actor, companyMembershipInput()),
    ).rejects.toThrow("FORBIDDEN");

    expect(statements.join("\n")).toContain('"membership_applications"');
    expect(statements.join("\n")).toContain('"company_members"');
  });

  it("denies a company membership when the actor has no active company membership", async () => {
    const statements: string[] = [];
    database.current = drizzle(async (query) => {
      statements.push(query);
      if (query.toLowerCase().includes('insert into "memberships"')) return {rows: [membershipRow]};
      return {rows: []};
    });

    await expect(membershipsRepository.create(actor, companyMembershipInput())).rejects.toThrow("FORBIDDEN");

    const sql = statements.join("\n").toLowerCase();
    expect(sql).toContain('"company_members"');
    expect(sql).not.toContain('insert into "memberships"');
  });

  it.each([
    {name: "plan", application: applicationRow({planCode: "startup"})},
    {name: "company", application: applicationRow({companyId: "company-a"})},
  ])("denies a company membership when the application $name does not match", async ({application}) => {
    database.current = drizzle(async (query) => {
      const normalized = query.toLowerCase();
      if (normalized.includes('from "company_members"') && !normalized.includes('"membership_applications"')) {
        return {rows: [["company-b"]]};
      }
      if (normalized.includes('from "membership_applications"')) return {rows: [application]};
      if (normalized.includes('insert into "memberships"')) return {rows: [membershipRow]};
      return {rows: []};
    });

    await expect(membershipsRepository.create(actor, companyMembershipInput())).rejects.toThrow("FORBIDDEN");
  });

  it("inserts a company membership after actor, application, company, and plan checks pass", async () => {
    const statements: string[] = [];
    database.current = drizzle(async (query) => {
      statements.push(query);
      const normalized = query.toLowerCase();
      if (normalized.includes('from "company_members"') && !normalized.includes('"membership_applications"')) {
        return {rows: [["company-b"]]};
      }
      if (normalized.includes('from "membership_applications"')) return {rows: [applicationRow()]};
      if (normalized.includes('insert into "memberships"')) return {rows: [membershipRow]};
      return {rows: []};
    });

    await expect(membershipsRepository.create(actor, companyMembershipInput())).resolves.toMatchObject({
      applicationId: "application-b",
      companyId: "company-b",
      planCode: "corporate",
    });
    expect(statements.at(-1)?.toLowerCase()).toContain('insert into "memberships"');
  });

  it("writes an explicit billingInterval on the insert instead of relying on the column default", async () => {
    const statements: string[] = [];
    const parameters: unknown[][] = [];
    database.current = drizzle(async (query, params) => {
      statements.push(query);
      parameters.push(params);
      const normalized = query.toLowerCase();
      if (normalized.includes('from "company_members"') && !normalized.includes('"membership_applications"')) {
        return {rows: [["company-b"]]};
      }
      if (normalized.includes('from "membership_applications"')) return {rows: [applicationRow()]};
      if (normalized.includes('insert into "memberships"')) return {rows: [membershipRow]};
      return {rows: []};
    });

    await membershipsRepository.create(actor, companyMembershipInput({billingInterval: "annual"}));

    const insertIndex = statements.findIndex((query) => query.toLowerCase().includes('insert into "memberships"'));
    expect(insertIndex).toBeGreaterThanOrEqual(0);
    expect(parameters[insertIndex]).toContain("annual");
  });

  it('writes billingInterval "none" for a free/review-track membership instead of the "annual" column default', async () => {
    const statements: string[] = [];
    const parameters: unknown[][] = [];
    database.current = drizzle(async (query, params) => {
      statements.push(query);
      parameters.push(params);
      const normalized = query.toLowerCase();
      if (normalized.includes('from "membership_applications"')) {
        return {rows: [applicationRow({companyId: null, planCode: "community"})]};
      }
      if (normalized.includes('insert into "memberships"')) return {rows: [membershipRow]};
      return {rows: []};
    });

    await membershipsRepository.create(actor, {
      ownerUserId: "user-a", companyId: null, applicationId: "application-b",
      planCode: "community", status: "active", seatLimit: 1, billingInterval: "none",
    });

    const insertIndex = statements.findIndex((query) => query.toLowerCase().includes('insert into "memberships"'));
    expect(insertIndex).toBeGreaterThanOrEqual(0);
    expect(parameters[insertIndex]).toContain("none");
    expect(parameters[insertIndex]).not.toContain("annual");
  });

  it("requires an actor-scoped application check for a member-owned membership", async () => {
    const statements: string[] = [];
    database.current = drizzle(async (query) => {
      statements.push(query);
      const normalized = query.toLowerCase();
      if (normalized.includes('from "membership_applications"')) {
        return {rows: [applicationRow({companyId: null, planCode: "community"})]};
      }
      if (normalized.includes('insert into "memberships"')) {
        return {rows: [[...membershipRow.slice(0, 1), "user-a", null, "application-b", "community", "active", 1, ...membershipRow.slice(7)]]};
      }
      return {rows: []};
    });

    await expect(
      membershipsRepository.create(actor, {
        ownerUserId: "user-a", companyId: null, applicationId: "application-b",
        planCode: "community", status: "active", seatLimit: 1, billingInterval: "none",
      }),
    ).resolves.toMatchObject({ownerUserId: "user-a", companyId: null, planCode: "community"});
    expect(statements.some((query) => query.toLowerCase().includes('from "membership_applications"'))).toBe(true);
  });

  it("preserves authored profile fields when ensure finds an existing profile", async () => {
    const statements: string[] = [];
    database.current = drizzle(async (query) => {
      statements.push(query);
      const normalized = query.toLowerCase();
      if (normalized.includes("on conflict") && normalized.includes("do update")) {
        return {
          rows: [[
            "user-a",
            "user-a",
            null,
            null,
            "en",
            "profile",
            false,
            existingProfileRow[7],
            new Date("2026-02-01T00:00:00.000Z"),
          ]],
        };
      }
      if (normalized.startsWith("select")) return {rows: [existingProfileRow]};
      return {rows: []};
    });

    const profile = await profilesRepository.ensure(actor, {id: actor.userId, displayName: actor.userId});

    expect(profile).toMatchObject({
      displayName: "Authored Display Name",
      phone: "+852 5555 5555",
      jobTitle: "Founder",
      locale: "zh-HK",
      directoryVisible: true,
    });
    expect(statements.join("\n").toLowerCase()).toContain("on conflict");
    expect(statements.join("\n").toLowerCase()).not.toContain("do update");
  });

  it("creates a company and initial active owner only by claiming the actor's application", async () => {
    const statements: string[] = [];
    database.current = drizzle(async (query) => {
      statements.push(query);
      return {rows: [{id: "company-a", legalName: "Acme Limited", displayName: "Acme"}]};
    });

    await expect(companiesRepository.createForApplication(actor, "application-a", {
      legalName: "Acme Limited", displayName: "Acme",
    }, {companyId: () => "company-a", memberId: () => "member-a"})).resolves.toMatchObject({id: "company-a"});

    expect(statements).toHaveLength(1);
    const sql = statements[0].toLowerCase();
    expect(sql.indexOf('update "membership_applications"')).toBeLessThan(sql.indexOf('insert into "companies"'));
    expect(sql).toContain('applicant_user_id');
    expect(sql).toContain('insert into "company_members"');
    expect(sql).toContain("owner");
  });

  it("rejects anonymous company creation before issuing SQL", async () => {
    const statements: string[] = [];
    database.current = drizzle(async (query) => {
      statements.push(query);
      return {rows: []};
    });

    await expect(companiesRepository.createForApplication({kind: "anonymous", userId: null}, "application-a", {
      legalName: "Acme Limited", displayName: "Acme",
    })).rejects.toThrow("FORBIDDEN");
    expect(statements).toEqual([]);
  });

  it("keeps company and owner creation in one rollback-safe statement", async () => {
    const statements: string[] = [];
    database.current = drizzle(async (query) => {
      statements.push(query);
      throw new Error("owner insert failed");
    });

    await expect(companiesRepository.createForApplication(actor, "application-a", {
      legalName: "Acme Limited", displayName: "Acme",
    })).rejects.toThrow("Failed query");
    expect(statements).toHaveLength(1);
  });

  it("allows only one concurrent claim of the same application", async () => {
    let calls = 0;
    database.current = drizzle(async () => {
      calls += 1;
      return calls === 1
        ? {rows: [{id: "company-a", legalName: "Acme Limited", displayName: "Acme"}]}
        : {rows: []};
    });

    const results = await Promise.allSettled([
      companiesRepository.createForApplication(actor, "application-a", {legalName: "Acme Limited", displayName: "Acme"}),
      companiesRepository.createForApplication(actor, "application-a", {legalName: "Other Limited", displayName: "Other"}),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(Promise.reject((results.find((result) => result.status === "rejected") as PromiseRejectedResult).reason)).rejects.toThrow("APPLICATION_COMPANY_CONFLICT");
  });

  it("denies an ordinary active company member from updating company data", async () => {
    const statements: string[] = [];
    const parameters: unknown[][] = [];
    database.current = drizzle(async (query, params) => {
      statements.push(query);
      parameters.push(params);
      return {rows: []};
    });

    await expect(companiesRepository.update(actor, "company-b", {displayName: "Attacker Rename"})).rejects.toThrow("FORBIDDEN");

    const sql = statements.join("\n").toLowerCase();
    expect(sql).toContain('from "company_members"');
    expect(sql).toContain('"role"');
    expect(sql).toContain('"revoked_at"');
    expect(parameters.flat()).toEqual(expect.arrayContaining(["owner", "admin"]));
  });

  it.each(["owner", "admin"] as const)("allows an active %s to update company data", async () => {
    const statements: string[] = [];
    const parameters: unknown[][] = [];
    database.current = drizzle(async (query, params) => {
      statements.push(query);
      parameters.push(params);
      return {rows: [companyRow]};
    });

    await expect(companiesRepository.update(actor, "company-b", {displayName: "Acme Updated"})).resolves.toMatchObject({
      id: "company-b",
      displayName: "Acme",
    });
    const sql = statements.join("\n").toLowerCase();
    expect(sql).toContain('from "company_members"');
    expect(sql).toContain('"role"');
    expect(parameters.flat()).toEqual(expect.arrayContaining(["owner", "admin"]));
  });

  // Programme B-7: `companies.update` is the other writer of the columns
  // `/members` and `/members/[slug]` render (lib/db/repos/company-profiles.ts's
  // `directoryColumns`/`detailColumns` project display_name, website, industry,
  // size_band and description). `companyProfilesRepository.updateProfile` sends a
  // published profile back to `pending_review`; without the same rule here, the
  // portal company form at /portal/company would let an approved company rewrite
  // its public copy indefinitely — the profile stays `published`, the review
  // queue (which selects only `pending_review`) never learns anything changed.
  it.each(["displayName", "website", "industry", "sizeBand", "description"] as const)(
    "sends a published member page back to review when a company update rewrites %s",
    async (field) => {
      const statements: string[] = [];
      database.current = drizzle(async (query) => {
        statements.push(query);
        return {rows: [companyRow]};
      });

      await expect(companiesRepository.update(actor, "company-b", {[field]: "Unreviewed copy"}))
        .resolves.toMatchObject({id: "company-b"});

      // `RETURNING` names every column, so only the SET clause proves the rule.
      const sql = setClause(statements.join("\n"));
      expect(sql).toContain('"public_profile_status"');
      expect(sql).toContain("'pending_review'");
      expect(sql).toContain('"profile_reviewed_at"');
      expect(sql).toContain('"profile_reviewed_by_profile_id"');
      expect(sql).toContain('"profile_rejection_reason"');
    },
  );

  it("leaves the review status alone for a company update that changes nothing /members renders", async () => {
    const statements: string[] = [];
    database.current = drizzle(async (query) => {
      statements.push(query);
      return {rows: [companyRow]};
    });

    await expect(companiesRepository.update(actor, "company-b", {
      legalName: "Acme Limited", directoryVisible: true, logoReference: "logo-1",
    })).resolves.toMatchObject({id: "company-b"});

    expect(setClause(statements.join("\n"))).not.toContain("public_profile_status");
  });

  // The three behaviours the demotion has to get right against the payload
  // `/portal/company` actually sends, where every publicly rendered key is
  // present on every save. Keying the demotion on "the key is present" would
  // take a published company off `/members`, `/members/[slug]` and the sitemap
  // for a legal-name correction or a Save with no edit at all, and null the
  // reviewer columns with it, until a human re-approved.
  describe.each([
    ["saves the form back unchanged", portalCompanySave(), false],
    ["changes only the legal name /members never renders", portalCompanySave({legalName: "Acme Group Limited"}), false],
    ["rewrites the description /members renders", portalCompanySave({description: "Rewritten after approval"}), true],
  ] as const)("when a published company %s", (_scenario, update, demotes) => {
    async function updateAndReadGate() {
      const calls: {query: string; params: unknown[]}[] = [];
      database.current = drizzle(async (query: string, params: unknown[]) => {
        calls.push({query, params});
        return {rows: [companyRow]};
      });
      await expect(companiesRepository.update(actor, "company-b", update)).resolves.toMatchObject({id: "company-b"});
      const statement = calls.find((call) => normalizedSql(call.query).startsWith("update"));
      return {clause: setClause(statement?.query), gate: demotionGate(statement?.query, statement?.params ?? [])};
    }

    it(`${demotes ? "re-enters" : "stays out of"} review`, async () => {
      const {gate} = await updateAndReadGate();
      // `legal_name` is deliberately absent: no member page renders it.
      expect(gate.columns).toEqual(["display_name", "website", "industry", "size_band", "description"]);
      expect(gate.fires(publishedCompanyColumns)).toBe(demotes);
    });

    it(`${demotes ? "clears" : "keeps"} the reviewer columns`, async () => {
      const {clause, gate} = await updateAndReadGate();
      // The reviewer columns are reset by the same gate, so they move exactly
      // when the status does rather than on every save.
      for (const column of ["profile_reviewed_at", "profile_reviewed_by_profile_id", "profile_rejection_reason"]) {
        expect(clause).toContain(`"${column}" = case when`);
        expect(clause).not.toContain(`"${column}" = null`);
      }
      expect(gate.guardedExpressions).toBe(4);
      expect(gate.fires(publishedCompanyColumns)).toBe(demotes);
    });
  });

  it("preserves system company updates without member-role scoping", async () => {
    const statements: string[] = [];
    database.current = drizzle(async (query) => {
      statements.push(query);
      return {rows: [companyRow]};
    });

    await expect(companiesRepository.update({kind: "system", userId: null, source: "stripe-webhook"}, "company-b", {
      displayName: "Acme Updated",
    })).resolves.toMatchObject({id: "company-b"});
    expect(statements.join("\n").toLowerCase()).not.toContain('from "company_members"');
  });

  it.each([
    ["memberships", () => membershipsRepository.getById(forgedUnsubscribeActor, "membership-a")],
    ["profiles", () => profilesRepository.getById(forgedUnsubscribeActor, "profile-a")],
    ["companies", () => companiesRepository.getById(forgedUnsubscribeActor, "company-a")],
  ])("rejects a forged unsubscribe actor at the %s repository before database access", async (_name, invoke) => {
    const statements: string[] = [];
    database.current = drizzle(async (query) => {
      statements.push(query);
      return {rows: []};
    });

    await expect(invoke()).rejects.toThrow("FORBIDDEN");
    expect(statements).toEqual([]);
  });

  it("scopes conversation ownership in production SQL rather than trusting returned rows", async () => {
    const statements: string[] = [];
    database.current = drizzle(async (query) => {
      statements.push(query);
      return {rows: []};
    });

    await expect(
      createConversationsRepository()
        .getOwned({kind: "profile", profileId: "profile-attacker"}, agent.conversationId),
    ).rejects.toMatchObject({code: "FORBIDDEN"});

    const sql = statements.join("\n").toLowerCase();
    expect(sql).toContain('"conversations"');
    expect(sql).toContain('"profile_id"');
    expect(sql).toContain('"id"');
  });

  it("uses the anonymous owner hash and null profile in the owned-conversation statement", async () => {
    const statements: string[] = [];
    const parameters: unknown[][] = [];
    database.current = drizzle(async (query, params) => {
      statements.push(query);
      parameters.push(params);
      return {rows: [conversationProxyRow(null, anonymousOwnerHash)]};
    });

    await expect(createConversationsRepository().getOwned({
      kind: "anonymous",
      anonymousOwnerHash,
    }, agent.conversationId)).resolves.toMatchObject({
      id: agent.conversationId,
      profileId: null,
      anonymousOwnerHash,
    });

    const ownerSql = normalizedSql(statements[0]);
    expect(ownerSql).toMatch(/where .*"id".*"profile_id" is null.*"anonymous_owner_hash" =/);
    expect(parameters[0]).toEqual(expect.arrayContaining([
      agent.conversationId,
      anonymousOwnerHash,
    ]));
  });

  it("binds append and list ownership in their dedicated production statements", async () => {
    const appendStatements: string[] = [];
    const appendParameters: unknown[][] = [];
    const appendResponses = [
      [conversationProxyRow(agent.profileId, null)],
      [messageProxyRow("created")],
      [],
    ];
    let appendCall = 0;
    database.current = drizzle(async (query, params) => {
      appendStatements.push(query);
      appendParameters.push(params);
      return {rows: appendResponses[appendCall++] ?? []};
    });

    await expect(createConversationsRepository().appendMessage({
      kind: "profile",
      profileId: agent.profileId!,
    }, agent.conversationId, {
      role: "user",
      channel: "web",
      content: "Hello",
      providerMessageId,
    })).resolves.toMatchObject({disposition: "created"});

    const appendOwnerSql = normalizedSql(appendStatements[0]);
    expect(appendOwnerSql).toMatch(/where .*"id".*"profile_id" =.*"anonymous_owner_hash" is null/);
    expect(appendParameters[0]).toEqual(expect.arrayContaining([
      agent.conversationId,
      agent.profileId,
    ]));
    expect(normalizedSql(appendStatements[1])).toMatch(/^insert into "messages".*conversation_id/);
    expect(appendParameters[1]).toContain(agent.conversationId);
    expect(normalizedSql(appendStatements[2])).toMatch(/^update "conversations".*where id =/);
    expect(appendParameters[2]).toContain(agent.conversationId);

    const listStatements: string[] = [];
    const listParameters: unknown[][] = [];
    const listResponses = [
      [conversationProxyRow(agent.profileId, null)],
      [messageProxyRow()],
    ];
    let listCall = 0;
    database.current = drizzle(async (query, params) => {
      listStatements.push(query);
      listParameters.push(params);
      return {rows: listResponses[listCall++] ?? []};
    });

    await expect(createConversationsRepository().listMessages({
      kind: "profile",
      profileId: agent.profileId!,
    }, agent.conversationId)).resolves.toMatchObject([
      {conversationId: agent.conversationId, content: "Hello"},
    ]);

    const listOwnerSql = normalizedSql(listStatements[0]);
    expect(listOwnerSql).toMatch(/where .*"id".*"profile_id" =.*"anonymous_owner_hash" is null/);
    expect(listParameters[0]).toEqual(expect.arrayContaining([
      agent.conversationId,
      agent.profileId,
    ]));
    expect(normalizedSql(listStatements[1])).toMatch(
      /^select .* from "messages" where "messages"\."conversation_id" =/,
    );
    expect(listParameters[1]).toContain(agent.conversationId);
  });

  it("scopes the fresh provider-conflict lookup to its conversation and provider ID", async () => {
    const statements: string[] = [];
    const parameters: unknown[][] = [];
    const responses = [
      [conversationProxyRow(agent.profileId, null)],
      [],
      [messageProxyRow("existing")],
      [],
    ];
    let call = 0;
    database.current = drizzle(async (query, params) => {
      statements.push(query);
      parameters.push(params);
      return {rows: responses[call++] ?? []};
    });

    await expect(createConversationsRepository().appendMessage({
      kind: "profile",
      profileId: agent.profileId!,
    }, agent.conversationId, {
      role: "user",
      channel: "web",
      content: "Retry",
      providerMessageId,
    })).resolves.toMatchObject({disposition: "existing"});

    expect(statements).toHaveLength(4);
    const conflictSql = normalizedSql(statements[2]);
    expect(conflictSql).toMatch(/^select existing\.\*.*from "messages" as existing where/);
    expect(conflictSql).toMatch(/existing\.conversation_id =.*existing\.provider_message_id =/);
    expect(parameters[2]).toEqual(expect.arrayContaining([
      agent.conversationId,
      providerMessageId,
    ]));
  });

  it("keeps every actor and lifecycle predicate in the terminal run update", async () => {
    const statements: string[] = [];
    const parameters: unknown[][] = [];
    database.current = drizzle(async (query, params) => {
      statements.push(query);
      parameters.push(params);
      return {rows: []};
    });

    await expect(createAgentRunsRepository().finish(agent, {
      completedAt: new Date("2027-04-10T10:00:01.000Z"),
      summaryCode: "answered",
    })).rejects.toThrow("INVALID_AGENT_RUN_TRANSITION");

    expect(statements).toHaveLength(1);
    const transitionSql = normalizedSql(statements[0]);
    expect(transitionSql).toMatch(/^update "agent_runs".*where id =/);
    expect(transitionSql).toMatch(
      /conversation_id =.*profile_id is not distinct from.*trigger =.*status = 'running'/,
    );
    expect(transitionSql).toMatch(/>= started_at/);
    expect(parameters[0]).toEqual(expect.arrayContaining([
      agent.runId,
      agent.conversationId,
      agent.profileId,
      agent.trigger,
    ]));
  });

  it("scopes an agent staff-task conflict lookup to dedupe, profile, conversation, and run", async () => {
    const statements: string[] = [];
    const parameters: unknown[][] = [];
    database.current = drizzle(async (query, params) => {
      statements.push(query);
      parameters.push(params);
      return {rows: []};
    });

    await expect(createStaffTasksRepository().createOnce(agent, {
      profileId: agent.profileId,
      journeyStateId: null,
      kind: "concierge_escalation",
      dedupeKey: `agent-run:${agent.runId}`,
      summaryCode: "human_requested",
      context: {
        conversationId: agent.conversationId,
        agentRunId: agent.runId,
        reasonCode: "human_requested",
        locale: "en",
      },
    })).rejects.toThrow("STAFF_TASK_DEDUPE_CONFLICT");

    expect(statements).toHaveLength(2);
    const conflictSql = normalizedSql(statements[1]);
    expect(conflictSql).toMatch(/^select .* from "staff_tasks" where/);
    expect(conflictSql).toMatch(/dedupe_key =.*profile_id is not distinct from/);
    expect(conflictSql).toMatch(/context ->> 'conversationid' =.*context ->> 'agentrunid' =/);
    expect(parameters[1]).toEqual(expect.arrayContaining([
      `agent-run:${agent.runId}`,
      agent.profileId,
      agent.conversationId,
      agent.runId,
    ]));
  });

  it("rejects an agent approval decision before database access", async () => {
    const loadDatabase = vi.fn();
    const repository = createApprovalsRepository(loadDatabase);

    await expect(repository.decide(
      agent as never,
      {
        approvalId: "44444444-4444-4444-8444-444444444444",
        decision: "approved",
      },
    )).rejects.toMatchObject({code: "FORBIDDEN"});
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  /**
   * Phase C1 S-14. The webhook route's HMAC is a gate on the ROUTE; these are
   * the gates on the REPOSITORY, and they are not the same claim — Task 11 adds
   * a backfill route with no HMAC in front of it that reaches the same table.
   * The two legacy woztell modules authorize nothing and predate §9; they are
   * the standing exceptions, not the precedent, so every new writer refuses a
   * member, an admin and an anonymous actor before it opens the database.
   */
  it.each([
    ["member", actor],
    ["admin", {kind: "staff", userId: "staff-a", profileId: "staff-a", role: "superadmin"}],
    ["anonymous", ANONYMOUS_ACTOR],
    // The shape a forged actor would take if `kind` alone were the check.
    ["hand-rolled webhook shape", {kind: "woztell-webhook", userId: null}],
  ] as const)(
    "refuses a %s actor on every woztell inbound event writer before database access",
    async (_name, forged) => {
      const loadDatabase = vi.fn();
      const events = createWoztellInboundEventsRepository(
        () => securityNow,
        loadDatabase,
      );

      await expect(events.recordDeliveryStatus(forged as never, {
        providerMessageId,
        status: "delivered",
        errorCode: null,
        occurredAt: securityNow,
      })).rejects.toThrow("FORBIDDEN");
      await expect(events.recordOutboundEcho(forged as never, {
        recipient: "+85290000000",
        text: "Thanks — someone will come back to you shortly.",
        providerMessageId,
        origin: "MANUAL",
        sentAt: securityNow,
      })).rejects.toThrow("FORBIDDEN");
      // Task 4's two staff-task writers reach `staff_tasks` — the same table the
      // admin panel resolves from — so they carry the same gate as the message
      // writers, not a comment claiming the route's HMAC covers them.
      await expect(events.notifyHumanLane(forged as never, {
        conversationId: "11111111-1111-4111-8111-111111111111",
        assignedToProfileId: null,
        locale: "en",
      })).rejects.toThrow("FORBIDDEN");
      await expect(events.notifyMemberIdConflict(forged as never, {
        whatsappMemberId: "member-9001",
        locale: "en",
      })).rejects.toThrow("FORBIDDEN");
      expect(loadDatabase).not.toHaveBeenCalled();
    },
  );

  /**
   * Phase C1 S-14, Task 10. The stamp writes the provider id onto an outbound
   * row, which is what makes every later delivery tick land somewhere; a caller
   * that could choose the row could point a member's ticks at another thread's
   * message. Its capability is a DIFFERENT `unique symbol` from the webhook's —
   * one per entry point — so the webhook's own actor is in this list too.
   */
  it.each([
    ["member", actor],
    ["admin", {kind: "staff", userId: "staff-a", profileId: "staff-a", role: "superadmin"}],
    ["anonymous", ANONYMOUS_ACTOR],
    ["hand-rolled delivery shape", {kind: "woztell-delivery", userId: null}],
    ["woztell webhook shape", {kind: "woztell-webhook", userId: null}],
  ] as const)(
    "refuses a %s actor on the concierge delivery stamp before database access",
    async (_name, forged) => {
      const loadDatabase = vi.fn();
      const stamp = createWoztellDeliveryStampRepository(loadDatabase);

      await expect(stamp.stampConciergeDelivery(forged as never, {
        inboundProviderMessageId: providerMessageId,
        providerId: "wamid.outbound.security",
      })).rejects.toThrow("FORBIDDEN");
      expect(loadDatabase).not.toHaveBeenCalled();
    },
  );

  it.each(["finish", "fail", "escalate", "disable"] as const)(
    "authorizes %s before validating attacker-controlled input or opening the database",
    async (method) => {
      const loadDatabase = vi.fn();
      const repository = createAgentRunsRepository(loadDatabase);
      const inputByMethod = {
        finish: {completedAt: "invalid", summary: "Alice Chan"},
        fail: {completedAt: "invalid", errorCode: '{"token":"secret"}'},
        escalate: {completedAt: "invalid", summary: "1 Queen's Road Central"},
        disable: {completedAt: "invalid", summary: "A123456(7)"},
      } as const;

      await expect(repository[method](
        actor as never,
        inputByMethod[method] as never,
      )).rejects.toMatchObject({code: "FORBIDDEN"});
      expect(loadDatabase).not.toHaveBeenCalled();
    },
  );

  /**
   * Phase C1 S-6. The inbox's write path is the first place in this repository
   * where a row exists in order to be *sent to a member's phone*, so its gate
   * belongs in this hand-maintained inventory and not only in the focused test.
   * `requireAdmin` runs before the `.strict()` parse and before the loader, so a
   * non-staff actor cannot reach the database even with input crafted to crash
   * the parse first.
   */
  it.each([
    ["member", actor],
    ["anonymous", ANONYMOUS_ACTOR],
    // A concierge agent is a capability principal with a `profileId`; it must
    // not be able to reply as staff into the thread it is handling.
    ["concierge agent", agent],
  ] as const)(
    "refuses a %s actor on every inbox staff write before database access",
    async (_name, forged) => {
      const loadDatabase = vi.fn();
      const inbox = createInboxRepository(loadDatabase);
      const conversationId = agent.conversationId;

      await expect(inbox.queueStaffMessage(forged as never, {
        conversationId,
        kind: "session",
        content: "Thanks — someone will come back to you shortly.",
        outboundKey: `inbox:${conversationId}:${"a".repeat(32)}`,
      })).rejects.toThrow("FORBIDDEN");
      await expect(inbox.settleStaffMessage(forged as never, {
        outboundKey: `inbox:${conversationId}:${"a".repeat(32)}`,
        outcome: {status: "sent", providerId: providerMessageId},
      })).rejects.toThrow("FORBIDDEN");
      await expect(inbox.setHandling(forged as never, {conversationId, handling: "human"}))
        .rejects.toThrow("FORBIDDEN");
      await expect(inbox.assign(forged as never, {conversationId, assignedToProfileId: "staff-a"}))
        .rejects.toThrow("FORBIDDEN");
      await expect(inbox.markRead(forged as never, conversationId)).rejects.toThrow("FORBIDDEN");
      await expect(inbox.close(forged as never, conversationId)).rejects.toThrow("FORBIDDEN");
      expect(loadDatabase).not.toHaveBeenCalled();
    },
  );
});
