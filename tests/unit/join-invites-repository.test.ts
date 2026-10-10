import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import {createJoinInvitesRepository} from "@/lib/db/repos/join-invites";
import {digestInviteToken} from "@/lib/membership/join-invite-token";
import {ANONYMOUS_ACTOR} from "@/lib/membership/lifecycle";

const dialect = new PgDialect();
type Row = Record<string, unknown>;
type Statement = Readonly<{text: string; params: readonly unknown[]}>;

/**
 * `responder` answers each statement by inspecting its normalised text, so a test
 * states which statement returns what instead of counting positions.
 */
function fakeDatabase(responder: (text: string) => Row[] = () => [], failing: (text: string) => Error | null = () => null) {
  const outer: Statement[] = [];
  const transactions: Statement[][] = [];
  const render = (query: unknown): Statement => {
    const rendered = dialect.sqlToQuery(query as Parameters<PgDialect["sqlToQuery"]>[0]);
    return {text: rendered.sql.replace(/\s+/g, " ").trim(), params: rendered.params};
  };
  const database = {
    async execute(query: unknown) {
      const statement = render(query);
      outer.push(statement);
      return {rows: responder(statement.text)};
    },
    async transaction<T>(work: (transaction: {execute: (query: unknown) => Promise<unknown>}) => Promise<T>): Promise<T> {
      const statements: Statement[] = [];
      transactions.push(statements);
      type Executor = {execute: (query: unknown) => Promise<unknown>; transaction: <U>(inner: (transaction: Executor) => Promise<U>) => Promise<U>};
      const executor: Executor = {
        async execute(query: unknown) {
          const statement = render(query);
          statements.push(statement);
          const failure = failing(statement.text);
          if (failure) throw failure;
          return {rows: responder(statement.text)};
        },
        // A savepoint: same statement log, and a thrown error propagates to the caller of it
        // (the real driver rolls back to the savepoint and rethrows).
        transaction: (inner) => inner(executor),
      };
      return work(executor);
    },
  };
  return {database, outer, transactions};
}

const admin = {kind: "staff", userId: "staff-a", profileId: "staff-a"} as const;
const member = {kind: "member", userId: "user-a", profileId: "user-a"} as const;
const contactId = "11111111-1111-4111-8111-111111111111";
const inviteId = "22222222-2222-4222-8222-222222222222";
const applicationId = "33333333-3333-4333-8333-333333333333";
const validToken = "A".repeat(43);

function inviteRow(overrides: Row = {}): Row {
  return {
    id: inviteId, contact_id: contactId, plan_code: "startup", created_by_profile_id: "staff-a",
    expires_at: new Date("2026-10-25T00:00:00.000Z"), opened_at: null, consumed_at: null,
    superseded_at: null, application_id: null, created_at: new Date("2026-10-11T00:00:00.000Z"),
    ...overrides,
  };
}

describe("joinInvitesRepository.create", () => {
  it("refuses non-admin actors before the database loads", async () => {
    const loadDatabase = vi.fn();
    const repository = createJoinInvitesRepository(loadDatabase);
    for (const forged of [member, ANONYMOUS_ACTOR]) {
      await expect(repository.create(forged as never, {contactId, planCode: "startup"})).rejects.toThrow("FORBIDDEN");
    }
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("locks the contact, supersedes live invites, then inserts, all in one transaction", async () => {
    const fake = fakeDatabase((text) => {
      if (text.startsWith("SELECT") && text.includes("FOR UPDATE")) return [{id: contactId}];
      if (text.startsWith("INSERT INTO \"join_invites\"")) return [inviteRow()];
      return [];
    });
    const repository = createJoinInvitesRepository(async () => fake.database as never);

    const result = await repository.create(admin, {contactId, planCode: "startup"});

    expect(fake.outer).toHaveLength(0);
    expect(fake.transactions).toHaveLength(1);
    const texts = fake.transactions[0]!.map((statement) => statement.text);
    const lock = texts.findIndex((text) => text.includes("FROM \"contacts\"") && text.includes("FOR UPDATE"));
    const supersede = texts.findIndex((text) => text.startsWith("UPDATE \"join_invites\"") && text.includes("superseded_at = now()"));
    const insert = texts.findIndex((text) => text.startsWith("INSERT INTO \"join_invites\""));
    const audit = texts.findIndex((text) => text.includes("join_invite.created"));
    expect(lock).toBe(0);
    expect(supersede).toBeGreaterThan(lock);
    expect(insert).toBeGreaterThan(supersede);
    expect(audit).toBeGreaterThan(insert);
    expect(texts[insert]).toContain("interval '14 days'");
    expect(result.invite.id).toBe(inviteId);
    expect(result.invite.planCode).toBe("startup");
  });

  it("stores the digest and never the raw token", async () => {
    const fake = fakeDatabase((text) => {
      if (text.includes("FOR UPDATE")) return [{id: contactId}];
      if (text.startsWith("INSERT INTO \"join_invites\"")) return [inviteRow()];
      return [];
    });
    const repository = createJoinInvitesRepository(async () => fake.database as never);

    const {token} = await repository.create(admin, {contactId, planCode: "community"});

    const params = fake.transactions[0]!.flatMap((statement) => [...statement.params]);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(params).toContain(digestInviteToken(token));
    expect(params).not.toContain(token);
    expect(JSON.stringify(params)).not.toContain(token);
  });

  it("refuses patron and unknown contacts", async () => {
    const repository = createJoinInvitesRepository(async () => fakeDatabase().database as never);
    await expect(repository.create(admin, {contactId, planCode: "patron" as never})).rejects.toThrow();
    await expect(repository.create(admin, {contactId, planCode: "startup"})).rejects.toThrow("CONTACT_NOT_FOUND");
  });
});

describe("joinInvitesRepository.open", () => {
  it("issues no query for a malformed token", async () => {
    const loadDatabase = vi.fn();
    const repository = createJoinInvitesRepository(loadDatabase);
    expect(await repository.open("not-a-token")).toBeNull();
    expect(await repository.open(42)).toBeNull();
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("looks up by digest equality and returns null for expired, consumed and superseded invites", async () => {
    // The filter lives in SQL; the fake models a database that matched nothing.
    const fake = fakeDatabase(() => []);
    const repository = createJoinInvitesRepository(async () => fake.database as never);

    expect(await repository.open(validToken)).toBeNull();

    const statements = [...fake.outer, ...fake.transactions.flat()];
    const lookup = statements[0]!;
    expect(lookup.params).toContain(digestInviteToken(validToken));
    expect(lookup.params).not.toContain(validToken);
    expect(lookup.text).toContain("consumed_at IS NULL");
    expect(lookup.text).toContain("superseded_at IS NULL");
    expect(lookup.text).toContain("expires_at > now()");
    expect(statements.some((statement) => statement.text.includes("contact_activities"))).toBe(false);
  });

  function openRow(overrides: Row = {}): Row {
    return {
      invite_id: inviteId, contact_id: contactId, plan_code: "startup", opened_at: null,
      expires_at: new Date("2026-10-25T00:00:00.000Z"), contact_display_name: "Ada Wong",
      contact_locale: "zh-HK", inviter_display_name: "Betty Lam", ...overrides,
    };
  }

  it("stamps opened_at and writes one activity on the first open only", async () => {
    const first = fakeDatabase((text) => (text.startsWith("SELECT") ? [openRow()] : [{id: inviteId}]));
    const opened = await createJoinInvitesRepository(async () => first.database as never).open(validToken);
    expect(opened).toEqual({
      inviteId, planCode: "startup", contactDisplayName: "Ada Wong", inviterFirstName: "Betty",
      locale: "zh-HK", expiresAt: new Date("2026-10-25T00:00:00.000Z"),
    });
    const firstTexts = [...first.outer, ...first.transactions.flat()].map((statement) => statement.text);
    expect(firstTexts.some((text) => text.startsWith("UPDATE \"join_invites\"") && text.includes("opened_at"))).toBe(true);
    expect(firstTexts.filter((text) => text.includes("contact_activities"))).toHaveLength(1);

    const again = fakeDatabase(() => [openRow({opened_at: new Date("2026-10-12T00:00:00.000Z")})]);
    expect(await createJoinInvitesRepository(async () => again.database as never).open(validToken)).not.toBeNull();
    const againTexts = [...again.outer, ...again.transactions.flat()].map((statement) => statement.text);
    expect(againTexts.some((text) => text.includes("contact_activities"))).toBe(false);
    expect(againTexts.some((text) => text.startsWith("UPDATE"))).toBe(false);
  });

  it("returns a null inviter first name when no staff profile created the invite", async () => {
    const fake = fakeDatabase(() => [openRow({inviter_display_name: null, opened_at: new Date()})]);
    const opened = await createJoinInvitesRepository(async () => fake.database as never).open(validToken);
    expect(opened?.inviterFirstName).toBeNull();
  });
});

describe("joinInvitesRepository.peek", () => {
  it("issues no query for a malformed token", async () => {
    const loadDatabase = vi.fn();
    const repository = createJoinInvitesRepository(loadDatabase);
    expect(await repository.peek("not-a-token")).toBeNull();
    expect(await repository.peek(42)).toBeNull();
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("returns null for dead invites using the same liveness filter as open", async () => {
    const fake = fakeDatabase(() => []);
    expect(await createJoinInvitesRepository(async () => fake.database as never).peek(validToken)).toBeNull();
    const lookup = fake.outer[0]!;
    expect(lookup.params).toContain(digestInviteToken(validToken));
    expect(lookup.text).toContain("consumed_at IS NULL");
    expect(lookup.text).toContain("superseded_at IS NULL");
    expect(lookup.text).toContain("expires_at > now()");
  });

  it("returns the invite without any write, even when it was never opened", async () => {
    const fake = fakeDatabase(() => [{
      invite_id: inviteId, contact_id: contactId, plan_code: "startup", opened_at: null,
      expires_at: new Date("2026-10-25T00:00:00.000Z"), contact_display_name: "Ada Wong",
      contact_locale: "zh-HK", inviter_display_name: "Betty Lam",
    }]);
    const peeked = await createJoinInvitesRepository(async () => fake.database as never).peek(validToken);
    expect(peeked).toMatchObject({inviteId, planCode: "startup", inviterFirstName: "Betty", locale: "zh-HK"});
    const texts = [...fake.outer, ...fake.transactions.flat()].map((statement) => statement.text);
    expect(texts).toHaveLength(1);
    expect(texts.some((text) => /^(UPDATE|INSERT)/.test(text) || text.includes("contact_activities"))).toBe(false);
  });
});

describe("joinInvitesRepository.prefillFor and latestForContact", () => {
  it("prefillFor returns null for a non-uuid id without a query", async () => {
    const loadDatabase = vi.fn();
    expect(await createJoinInvitesRepository(loadDatabase).prefillFor("nope")).toBeNull();
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("prefillFor only reads live invites", async () => {
    const fake = fakeDatabase(() => []);
    expect(await createJoinInvitesRepository(async () => fake.database as never).prefillFor(inviteId)).toBeNull();
    const text = fake.outer[0]!.text;
    expect(text).toContain("consumed_at IS NULL");
    expect(text).toContain("superseded_at IS NULL");
    expect(text).toContain("expires_at > now()");
  });

  it("latestForContact is admin only and derives the state", async () => {
    const loadDatabase = vi.fn();
    await expect(createJoinInvitesRepository(loadDatabase).latestForContact(member as never, contactId)).rejects.toThrow("FORBIDDEN");
    expect(loadDatabase).not.toHaveBeenCalled();

    const cases: ReadonlyArray<readonly [Row, string]> = [
      [{}, "live"],
      [{opened_at: new Date()}, "opened"],
      [{consumed_at: new Date()}, "consumed"],
      [{superseded_at: new Date()}, "superseded"],
      [{expires_at: new Date(Date.now() - 1000)}, "expired"],
    ];
    for (const [overrides, state] of cases) {
      const fake = fakeDatabase(() => [inviteRow({expires_at: new Date(Date.now() + 86_400_000), ...overrides})]);
      const latest = await createJoinInvitesRepository(async () => fake.database as never).latestForContact(admin, contactId);
      expect(latest?.state).toBe(state);
    }
  });
});

describe("joinInvitesRepository.consume", () => {
  it("returns not_live and writes nothing further when the conditional update matches no row", async () => {
    const fake = fakeDatabase((text) => (text.includes("applicant_user_id") ? [{id: applicationId}] : []));
    const result = await createJoinInvitesRepository(async () => fake.database as never)
      .consume(member, {inviteId, applicationId});
    expect(result).toBe("not_live");
    const texts = fake.transactions.flat().map((statement) => statement.text);
    expect(texts.some((text) => text.startsWith("UPDATE \"join_invites\"") && text.includes("consumed_at = now()"))).toBe(true);
    expect(texts.filter((text) => /^(UPDATE|INSERT)/.test(text))).toHaveLength(1);
  });

  it("returns not_live without writes when the actor does not own the application", async () => {
    const fake = fakeDatabase(() => []);
    const result = await createJoinInvitesRepository(async () => fake.database as never)
      .consume(member, {inviteId, applicationId});
    expect(result).toBe("not_live");
    const all = [...fake.outer, ...fake.transactions.flat()];
    expect(all.some((statement) => /^(UPDATE|INSERT)/.test(statement.text))).toBe(false);
  });

  it("refuses non-member actors", async () => {
    await expect(createJoinInvitesRepository(vi.fn()).consume(ANONYMOUS_ACTOR as never, {inviteId, applicationId}))
      .rejects.toThrow("FORBIDDEN");
  });

  function consumeFake() {
    return fakeDatabase((text) => {
      if (text.includes("applicant_user_id") && text.startsWith("SELECT")) return [{id: applicationId}];
      if (text.startsWith("UPDATE \"join_invites\"")) return [{contact_id: contactId}];
      return [];
    });
  }

  it("links, stages forward-only, and records activity and audit in one transaction", async () => {
    const fake = consumeFake();
    const result = await createJoinInvitesRepository(async () => fake.database as never)
      .consume(member, {inviteId, applicationId});
    expect(result).toBe("consumed");
    expect(fake.outer).toHaveLength(0);
    const statements = fake.transactions[0]!;
    const texts = statements.map((statement) => statement.text);
    expect(texts.some((text) => text.includes("UPDATE \"membership_applications\"") && text.includes("invite_id"))).toBe(true);
    const stage = texts.find((text) => text.includes("stage = 'applied'"))!;
    expect(stage).toContain("IN ('new', 'contacted', 'qualified')");
    expect(stage).not.toContain("'member'");
    const link = texts.find((text) => text.includes("profile_id IS NULL") && text.includes("NOT EXISTS"))!;
    expect(link).toContain("UPDATE \"contacts\"");
    expect(statements.flatMap((statement) => [...statement.params])).toContain(member.profileId);
    expect(texts.some((text) => text.includes("contact_activities"))).toBe(true);
    expect(texts.some((text) => text.includes("join_invite.consumed"))).toBe(true);
  });

  it("still consumes when the profile link hits a unique violation (23505)", async () => {
    const duplicate = Object.assign(new Error("duplicate key value violates unique constraint"), {code: "23505"});
    const fake = fakeDatabase(
      (text) => {
        if (text.includes("applicant_user_id") && text.startsWith("SELECT")) return [{id: applicationId}];
        if (text.startsWith("UPDATE \"join_invites\"")) return [{contact_id: contactId}];
        return [];
      },
      (text) => (text.includes("profile_id IS NULL") && text.includes("NOT EXISTS") ? duplicate : null),
    );
    const result = await createJoinInvitesRepository(async () => fake.database as never).consume(member, {inviteId, applicationId});
    expect(result).toBe("consumed");
    const texts = fake.transactions[0]!.map((statement) => statement.text);
    expect(texts.some((text) => text.includes("UPDATE \"membership_applications\"") && text.includes("invite_id"))).toBe(true);
    expect(texts.some((text) => text.includes("stage = 'applied'"))).toBe(true);
    expect(texts.some((text) => text.includes("join_invite.consumed"))).toBe(true);
  });

  describe("free-plan invitee (membership already active when consume runs)", () => {
    function fake(hasActive: boolean, moves: boolean) {
      return fakeDatabase((text) => {
        if (text.includes("applicant_user_id") && text.startsWith("SELECT")) return [{id: applicationId}];
        if (text.startsWith("UPDATE \"join_invites\"")) return [{contact_id: contactId}];
        if (text.includes("FROM \"memberships\"")) return hasActive ? [{active: 1}] : [];
        if (text.startsWith("UPDATE \"contacts\"") && text.includes("stage = 'member'")) return moves ? [{id: contactId}] : [];
        return [];
      });
    }
    const kinds = (statements: readonly Statement[]) => statements
      .filter((statement) => statement.text.includes("INSERT INTO \"contact_activities\""))
      .map((statement) => statement.params.find((param) => param === "applied" || param === "became_member"));

    it("moves the contact to member after the applied entry, both activities in order", async () => {
      const f = fake(true, true);
      await expect(createJoinInvitesRepository(async () => f.database as never).consume(member, {inviteId, applicationId})).resolves.toBe("consumed");
      const statements = f.transactions[0]!;
      const texts = statements.map((statement) => statement.text);
      const toMember = texts.find((text) => text.includes("stage = 'member'"))!;
      expect(toMember).toContain("IN ('new', 'contacted', 'qualified', 'applied')");
      expect(toMember).not.toContain("'closed'");
      // The link happens before the membership check, so the order problem (flip ran earlier, found
      // nothing) cannot recur: the contact ends at member whichever action ran first.
      expect(texts.findIndex((text) => text.includes("profile_id IS NULL"))).toBeLessThan(texts.findIndex((text) => text.includes("stage = 'member'")));
      expect(kinds(statements)).toEqual(["applied", "became_member"]);
    });

    it("writes no became_member entry when the contact was already member or closed", async () => {
      const f = fake(true, false);
      await createJoinInvitesRepository(async () => f.database as never).consume(member, {inviteId, applicationId});
      expect(kinds(f.transactions[0]!)).toEqual(["applied"]);
    });

    it("keeps applied, and never touches the stage to member, without an active membership", async () => {
      const f = fake(false, true);
      await createJoinInvitesRepository(async () => f.database as never).consume(member, {inviteId, applicationId});
      const texts = f.transactions[0]!.map((statement) => statement.text);
      expect(texts.some((text) => text.includes("stage = 'member'"))).toBe(false);
      expect(texts.some((text) => text.includes("stage = 'applied'") && text.includes("IN ('new', 'contacted', 'qualified')"))).toBe(true);
      expect(kinds(f.transactions[0]!)).toEqual(["applied"]);
    });

    it("audits the member move as contact.became_member, like markMemberForProfile", async () => {
      const moved = fake(true, true);
      await createJoinInvitesRepository(async () => moved.database as never).consume(member, {inviteId, applicationId});
      const audits = moved.transactions[0]!.filter((statement) => statement.text.startsWith("INSERT INTO \"audit_events\"") && statement.text.includes("'contact.became_member'"));
      expect(audits).toHaveLength(1);
      expect(audits[0]!.params).toEqual(expect.arrayContaining([contactId]));
      const still = fake(true, false);
      await createJoinInvitesRepository(async () => still.database as never).consume(member, {inviteId, applicationId});
      expect(still.transactions[0]!.some((statement) => statement.text.includes("'contact.became_member'"))).toBe(false);
    });
  });

  /**
   * Final review I1. Abandon checkout, staff re-mint, the lead resubmits the SAME application:
   * without a guard the second consume re-points `invite_id` and both invites claim the
   * application. The spend refuses when another invite already holds it, and the application
   * row is locked so two concurrent consumes for one application serialise on it.
   */
  it("refuses to spend a second invite on an application another invite already holds", async () => {
    const fake = fakeDatabase((text) => (text.includes("applicant_user_id") && text.startsWith("SELECT") ? [{id: applicationId}] : []));
    const result = await createJoinInvitesRepository(async () => fake.database as never).consume(member, {inviteId, applicationId});
    expect(result).toBe("not_live");
    const texts = fake.transactions[0]!.map((statement) => statement.text);
    expect(texts[0]).toContain("FOR UPDATE");
    const spend = fake.transactions[0]!.find((statement) => statement.text.startsWith("UPDATE \"join_invites\""))!;
    expect(spend.text).toMatch(/NOT EXISTS \(SELECT 1 FROM "join_invites" other WHERE other\.application_id = \$\d+ AND other\.id <> \$\d+\)/);
    expect(spend.params).toEqual(expect.arrayContaining([applicationId, inviteId]));
    expect(texts.filter((text) => /^(UPDATE|INSERT)/.test(text))).toHaveLength(1);
  });

  it("does not swallow other errors from the link", async () => {
    const fake = fakeDatabase(
      (text) => (text.includes("applicant_user_id") && text.startsWith("SELECT") ? [{id: applicationId}] : text.startsWith("UPDATE \"join_invites\"") ? [{contact_id: contactId}] : []),
      (text) => (text.startsWith("UPDATE \"contacts\"") && text.includes("NOT EXISTS") ? new Error("connection lost") : null),
    );
    await expect(createJoinInvitesRepository(async () => fake.database as never).consume(member, {inviteId, applicationId})).rejects.toThrow("connection lost");
  });
});

/**
 * Final review I4. The magic link opened in another browser carries no `wtia_invite` cookie, so
 * attribution falls back to the newest live invite whose contact's email is the signed-in
 * profile's own. Member only, read only, and the email comes from the profile row, never input.
 */
describe("joinInvitesRepository.liveInviteIdForMember", () => {
  it("refuses non-member actors before the database loads", async () => {
    const loadDatabase = vi.fn();
    const repository = createJoinInvitesRepository(loadDatabase);
    await expect(repository.liveInviteIdForMember(admin as never)).rejects.toThrow("FORBIDDEN");
    await expect(repository.liveInviteIdForMember(ANONYMOUS_ACTOR as never)).rejects.toThrow("FORBIDDEN");
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("matches the profile's email case-insensitively against live invites only, newest first, with no write", async () => {
    const fake = fakeDatabase((text) => (text.startsWith("SELECT") ? [{id: inviteId}] : []));
    await expect(createJoinInvitesRepository(async () => fake.database as never).liveInviteIdForMember(member)).resolves.toBe(inviteId);
    expect(fake.transactions).toHaveLength(0);
    expect(fake.outer).toHaveLength(1);
    const lookup = fake.outer[0]!;
    expect(lookup.text).toContain("lower(c.email) = lower(p.email)");
    expect(lookup.text).toContain("p.id = $");
    expect(lookup.params).toContain(member.profileId);
    expect(lookup.text).toContain("i.consumed_at IS NULL AND i.superseded_at IS NULL AND i.expires_at > now()");
    expect(lookup.text).toContain("ORDER BY i.created_at DESC");
  });

  it("answers null when nothing matches", async () => {
    const fake = fakeDatabase(() => []);
    await expect(createJoinInvitesRepository(async () => fake.database as never).liveInviteIdForMember(member)).resolves.toBeNull();
  });
});

/** Final review M3: the emailed link must be the invite and contact the form names. */
describe("joinInvitesRepository.tokenBelongsTo", () => {
  it("is admin only, answers false for a malformed token without a query, and binds digest, invite and contact", async () => {
    const loadDatabase = vi.fn();
    await expect(createJoinInvitesRepository(loadDatabase).tokenBelongsTo(member as never, {token: validToken, inviteId, contactId})).rejects.toThrow("FORBIDDEN");
    await expect(createJoinInvitesRepository(loadDatabase).tokenBelongsTo(admin as never, {token: "short", inviteId, contactId})).resolves.toBe(false);
    expect(loadDatabase).not.toHaveBeenCalled();

    const hit = fakeDatabase(() => [{id: inviteId}]);
    await expect(createJoinInvitesRepository(async () => hit.database as never).tokenBelongsTo(admin as never, {token: validToken, inviteId, contactId})).resolves.toBe(true);
    expect(hit.outer[0]!.params).toEqual(expect.arrayContaining([digestInviteToken(validToken), inviteId, contactId]));
    expect(hit.outer[0]!.params).not.toContain(validToken);
    const miss = fakeDatabase(() => []);
    await expect(createJoinInvitesRepository(async () => miss.database as never).tokenBelongsTo(admin as never, {token: validToken, inviteId, contactId})).resolves.toBe(false);
  });
});
