import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import {CONTACT_MERGE_CANDIDATE_TAG, contactWriterActor, createContactsRepository} from "@/lib/db/repos/contacts";
import {updateProfile} from "@/lib/portal/command-core";

const dialect = new PgDialect();

type Statement = Readonly<{sql: string; params: readonly unknown[]}>;

/**
 * Phase C2 Task 5. The same transactional fake
 * `tests/unit/contacts-consent-audit.test.ts` uses, plus the ability to make a
 * queued statement THROW: the merge's whole reason for existing in one
 * transaction is that `contacts_profile_unique` can refuse the claim, and a
 * 23505 that reaches the caller is a 500 on a profile save the member already
 * made (S-16: "the link never throws into the sign-in or save path").
 */
function transactionalRecorder(responses: readonly (Record<string, unknown>[] | Error)[]) {
  const statements: Statement[] = [];
  const transactionOf: number[] = [];
  const queue = [...responses];
  let transactions = 0;
  let current = 0;
  const execute = vi.fn(async (query: never) => {
    const compiled = dialect.sqlToQuery(query);
    statements.push({sql: compiled.sql, params: compiled.params});
    transactionOf.push(current);
    const next = queue.shift() ?? [];
    if (next instanceof Error) throw next;
    return next;
  });
  const database = {
    execute,
    async transaction<T>(work: (transaction: {execute: typeof execute}) => Promise<T>): Promise<T> {
      transactions += 1;
      current = transactions;
      try {
        return await work({execute});
      } finally {
        current = 0;
      }
    },
  };
  return {
    statements,
    transactionOf,
    execute,
    database: database as never,
    transactionCount: () => transactions,
  };
}

/** `--` comments run to the end of a line; strip them before collapsing. */
function normalized(statement: string | undefined): string {
  return (statement ?? "").replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function startingWith(statements: readonly Statement[], prefix: string): readonly Statement[] {
  return statements.filter((statement) => normalized(statement.sql).startsWith(prefix));
}

function metadataOf(statement: Statement | undefined): Record<string, unknown> {
  const json = (statement?.params ?? []).find((value) => typeof value === "string" && value.trimStart().startsWith("{"));
  return JSON.parse(String(json)) as Record<string, unknown>;
}

function duplicateKeyError() {
  return Object.assign(new Error("duplicate key value violates unique constraint"), {code: "23505"});
}

const writer = contactWriterActor("import");
const phone = "+85291234567";

describe("linkProfile matches on member id, then phone, then email (C-4, S-16)", () => {
  it("links the contact whose number the member just saved and audits contact.linked", async () => {
    // [select by phone, claim, tag candidates, audit]
    const recorder = transactionalRecorder([[{id: "c-phone"}], [{id: "c-phone"}], [], []]);
    const repository = createContactsRepository(async () => recorder.database);

    await expect(repository.linkProfile(writer, {profileId: "member-1", email: null, phoneE164: phone}))
      .resolves.toEqual({linked: "c-phone", matchedBy: "phone", candidates: []});

    const lookup = normalized(recorder.statements[0]?.sql);
    expect(lookup).toMatch(/^select /);
    expect(lookup).toContain(`"contacts"."phone_e164" =`);
    expect(lookup).toContain("for update");
    const claim = normalized(recorder.statements[1]?.sql);
    expect(claim).toMatch(/^update "contacts"/);
    // The claim is guarded, which is what makes a second call a no-op instead of
    // a row theft from whichever profile got there first.
    expect(claim).toContain(`"contacts"."profile_id" is null`);
    expect(claim).toContain("'member'");
    const audits = startingWith(recorder.statements, `insert into "audit_events"`);
    expect(audits).toHaveLength(1);
    expect(normalized(audits[0]?.sql)).toContain("'contact.linked'");
    expect(normalized(audits[0]?.sql)).toContain("'contact'");
    expect(audits[0]?.params).toEqual(expect.arrayContaining(["contact-writer", "c-phone"]));
    expect(metadataOf(audits[0])).toEqual({profileId: "member-1", matchedBy: "phone", candidates: 0});
    expect(recorder.transactionCount()).toBe(1);
    expect(new Set(recorder.transactionOf)).toEqual(new Set([1]));
  });

  it("prefers a Woztell member id over a phone match on a different row", async () => {
    // C1's O-3, which spec C-1 asked for ("resolve by member id THEN number") and
    // neither plan implemented: the id follows the provider's account and
    // survives a number change, so it is the stronger evidence.
    const recorder = transactionalRecorder([[{id: "c-member"}], [{id: "c-member"}], [], []]);
    const repository = createContactsRepository(async () => recorder.database);

    await expect(repository.linkProfile(writer, {
      profileId: "member-1", email: "ada@example.hk", phoneE164: phone, whatsappMemberId: "wz-900",
    })).resolves.toEqual({linked: "c-member", matchedBy: "member_id", candidates: []});

    const lookups = startingWith(recorder.statements, "select");
    expect(lookups).toHaveLength(1);
    expect(normalized(lookups[0]?.sql)).toContain(`"contacts"."whatsapp_member_id" =`);
    expect(lookups[0]?.params).toContain("wz-900");
  });

  it("falls through to the email arm only when no number matches, and only for an unclaimed row", async () => {
    // [select by phone: miss, select by email, claim, tag, audit]
    const recorder = transactionalRecorder([[], [{id: "c-email"}], [{id: "c-email"}], [], []]);
    const repository = createContactsRepository(async () => recorder.database);

    await expect(repository.linkProfile(writer, {profileId: "member-1", email: "ADA@example.hk", phoneE164: phone}))
      .resolves.toEqual({linked: "c-email", matchedBy: "email", candidates: []});

    const email = normalized(recorder.statements[1]?.sql);
    expect(email).toContain("lower(");
    expect(email).toContain(`"contacts"."profile_id" is null`);
    expect(recorder.statements[1]?.params).toContain("ada@example.hk");
  });

  it("tags the other matching row and raises one deduped merge-candidate task", async () => {
    // [select by phone, claim, tag → one other row, staff task, audit]
    const recorder = transactionalRecorder([
      [{id: "c-phone"}], [{id: "c-phone"}], [{id: "c-email"}], [{id: "task-1"}], [],
    ]);
    const repository = createContactsRepository(async () => recorder.database);

    await expect(repository.linkProfile(writer, {
      profileId: "member-1", email: "ada@example.hk", phoneE164: phone,
    })).resolves.toEqual({linked: "c-phone", matchedBy: "phone", candidates: ["c-email"]});

    const tag = normalized(recorder.statements[2]?.sql);
    expect(tag).toMatch(/^update "contacts"/);
    expect(tag).toContain("array_append");
    expect(recorder.statements[2]?.params).toContain(CONTACT_MERGE_CANDIDATE_TAG);
    // Parenthesised, and excluding the row we just claimed: an unbracketed OR
    // beside the id predicate would tag the whole table.
    expect(tag).toContain(`"contacts"."id" <>`);
    expect(tag).toMatch(/\(\s*lower\(/);
    const tasks = startingWith(recorder.statements, `insert into "staff_tasks"`);
    expect(tasks).toHaveLength(1);
    expect(normalized(tasks[0]?.sql)).toContain("on conflict do nothing");
    expect(tasks[0]?.params).toEqual(expect.arrayContaining([
      "member-1", "contact_merge_candidate", "contact-merge:member-1",
    ]));
    const audits = startingWith(recorder.statements, `insert into "audit_events"`);
    expect(metadataOf(audits[0])).toEqual({profileId: "member-1", matchedBy: "phone", candidates: 1});
    expect(new Set(recorder.transactionOf)).toEqual(new Set([1]));
  });

  it("is a no-op on the second call and writes no second audit row", async () => {
    // The row is found, but the guarded claim matches nothing because it is
    // already linked. Nothing is tagged, no task is raised, nothing is audited.
    const recorder = transactionalRecorder([[{id: "c-phone"}], []]);
    const repository = createContactsRepository(async () => recorder.database);

    await expect(repository.linkProfile(writer, {profileId: "member-1", email: null, phoneE164: phone}))
      .resolves.toEqual({linked: null, matchedBy: null, candidates: []});

    expect(recorder.statements).toHaveLength(2);
    expect(startingWith(recorder.statements, `insert into "audit_events"`)).toHaveLength(0);
    expect(startingWith(recorder.statements, `insert into "staff_tasks"`)).toHaveLength(0);
  });

  it("swallows the contacts_profile_unique race rather than 500ing a saved profile", async () => {
    // `contacts_profile_unique` is a partial unique index, so at most one contact
    // per profile. Two saves racing, or a profile that already owns a different
    // contact row, raise 23505 — on a path whose caller is fire-and-forget.
    const recorder = transactionalRecorder([[{id: "c-phone"}], duplicateKeyError()]);
    const repository = createContactsRepository(async () => recorder.database);

    await expect(repository.linkProfile(writer, {profileId: "member-1", email: null, phoneE164: phone}))
      .resolves.toEqual({linked: null, matchedBy: null, candidates: []});
  });

  it("still surfaces a failure that is not the unique-index race", async () => {
    const recorder = transactionalRecorder([
      [{id: "c-phone"}],
      Object.assign(new Error("connection terminated"), {code: "57P01"}),
    ]);
    const repository = createContactsRepository(async () => recorder.database);

    await expect(repository.linkProfile(writer, {profileId: "member-1", email: null, phoneE164: phone}))
      .rejects.toThrow("connection terminated");
  });

  it("opens no transaction when the profile carries no identity to match on", async () => {
    const recorder = transactionalRecorder([]);
    const repository = createContactsRepository(async () => recorder.database);

    await expect(repository.linkProfile(writer, {profileId: "member-1", email: null, phoneE164: null}))
      .resolves.toEqual({linked: null, matchedBy: null, candidates: []});

    expect(recorder.execute).not.toHaveBeenCalled();
  });

  it("skips an identity that does not normalise rather than guessing at it", async () => {
    // "+90000000" and "+85290000000" are different people and nothing in the tree
    // validates a country code, so a number the caller could not normalise is
    // dropped — never widened into a LIKE or a suffix match.
    const recorder = transactionalRecorder([[{id: "c-email"}], [{id: "c-email"}], [], []]);
    const repository = createContactsRepository(async () => recorder.database);

    await expect(repository.linkProfile(writer, {
      profileId: "member-1", email: "ada@example.hk", phoneE164: "not-a-number",
    })).resolves.toEqual({linked: "c-email", matchedBy: "email", candidates: []});

    expect(normalized(recorder.statements[0]?.sql)).toContain("lower(");
  });

  it("refuses every actor without the contact-writer capability, before any statement", async () => {
    const recorder = transactionalRecorder([]);
    const repository = createContactsRepository(async () => recorder.database);
    const input = {profileId: "member-1", email: null, phoneE164: phone};

    await expect(repository.linkProfile({kind: "member", userId: "u", profileId: "p"}, input)).rejects.toThrow("FORBIDDEN");
    await expect(repository.linkProfile({kind: "staff", userId: "s", profileId: "s"}, input)).rejects.toThrow("FORBIDDEN");
    await expect(repository.linkProfile({kind: "anonymous", userId: null}, input)).rejects.toThrow("FORBIDDEN");
    await expect(repository.linkProfile({kind: "contact-writer", userId: null, source: "import"}, input)).rejects.toThrow("FORBIDDEN");
    expect(recorder.execute).not.toHaveBeenCalled();
  });
});

describe("reconcileWhatsAppMemberId corrects an id that landed on the wrong row (C1 O-3)", () => {
  const memberId = "wz-900";

  it("moves the id to the row that now owns the number and audits the move", async () => {
    // [holder, target, clear holder, set target, audit]
    const recorder = transactionalRecorder([
      [{id: "c-old", phone_e164: "+85298888888", whatsapp_member_id: memberId}],
      [{id: "c-new", whatsapp_member_id: null}],
      [], [], [],
    ]);
    const repository = createContactsRepository(async () => recorder.database);

    await expect(repository.reconcileWhatsAppMemberId(writer, {whatsappMemberId: memberId, phoneE164: phone}))
      .resolves.toEqual({disposition: "reassigned"});

    // Cleared BEFORE it is set: `contacts_whatsapp_member_unique` is checked per
    // statement, not at commit, so the other order raises 23505 on itself.
    const clear = normalized(recorder.statements[2]?.sql);
    expect(clear).toMatch(/^update "contacts"/);
    expect(clear).toContain("whatsapp_member_id = null");
    expect(recorder.statements[2]?.params).toContain("c-old");
    const assign = normalized(recorder.statements[3]?.sql);
    expect(assign).toMatch(/^update "contacts"/);
    expect(recorder.statements[3]?.params).toEqual(expect.arrayContaining([memberId, "c-new"]));
    const audits = startingWith(recorder.statements, `insert into "audit_events"`);
    expect(audits).toHaveLength(1);
    expect(normalized(audits[0]?.sql)).toContain("'contact.member_id_reassigned'");
    expect(metadataOf(audits[0])).toEqual({from: "c-old", to: "c-new", whatsappMemberId: memberId});
    expect(recorder.transactionCount()).toBe(1);
    expect(new Set(recorder.transactionOf)).toEqual(new Set([1]));
  });

  it("assigns a free id to the number's row without an audit row", async () => {
    const recorder = transactionalRecorder([[], [{id: "c-new", whatsapp_member_id: null}], [{id: "c-new"}]]);
    const repository = createContactsRepository(async () => recorder.database);

    await expect(repository.reconcileWhatsAppMemberId(writer, {whatsappMemberId: memberId, phoneE164: phone}))
      .resolves.toEqual({disposition: "assigned"});

    expect(startingWith(recorder.statements, `insert into "audit_events"`)).toHaveLength(0);
  });

  it("writes nothing when the id is already on the number's row", async () => {
    const recorder = transactionalRecorder([
      [{id: "c-new", phone_e164: phone, whatsapp_member_id: memberId}],
      [{id: "c-new", whatsapp_member_id: memberId}],
    ]);
    const repository = createContactsRepository(async () => recorder.database);

    await expect(repository.reconcileWhatsAppMemberId(writer, {whatsappMemberId: memberId, phoneE164: phone}))
      .resolves.toEqual({disposition: "unchanged"});

    expect(recorder.statements).toHaveLength(2);
  });

  it("reports a conflict and writes nothing when no row carries the number", async () => {
    const recorder = transactionalRecorder([[{id: "c-old", phone_e164: "+85298888888", whatsapp_member_id: memberId}], []]);
    const repository = createContactsRepository(async () => recorder.database);

    await expect(repository.reconcileWhatsAppMemberId(writer, {whatsappMemberId: memberId, phoneE164: phone}))
      .resolves.toEqual({disposition: "conflict"});

    expect(recorder.statements).toHaveLength(2);
  });

  it("reports a conflict when the number's row already carries a different id", async () => {
    // Two identities on one number. Guessing here is how two people's threads
    // merge, so staff decide.
    const recorder = transactionalRecorder([[], [{id: "c-new", whatsapp_member_id: "wz-777"}]]);
    const repository = createContactsRepository(async () => recorder.database);

    await expect(repository.reconcileWhatsAppMemberId(writer, {whatsappMemberId: memberId, phoneE164: phone}))
      .resolves.toEqual({disposition: "conflict"});

    expect(recorder.statements).toHaveLength(2);
  });

  it("never raises 23505 into the caller", async () => {
    const recorder = transactionalRecorder([
      [{id: "c-old", phone_e164: "+85298888888", whatsapp_member_id: memberId}],
      [{id: "c-new", whatsapp_member_id: null}],
      duplicateKeyError(),
    ]);
    const repository = createContactsRepository(async () => recorder.database);

    await expect(repository.reconcileWhatsAppMemberId(writer, {whatsappMemberId: memberId, phoneE164: phone}))
      .resolves.toEqual({disposition: "conflict"});
  });

  it("refuses an actor without the contact-writer capability, before any statement", async () => {
    const recorder = transactionalRecorder([]);
    const repository = createContactsRepository(async () => recorder.database);

    await expect(repository.reconcileWhatsAppMemberId(
      {kind: "staff", userId: "s", profileId: "s"},
      {whatsappMemberId: memberId, phoneE164: phone},
    )).rejects.toThrow("FORBIDDEN");
    expect(recorder.execute).not.toHaveBeenCalled();
  });
});

/**
 * S-16: the merge is merge-on-WRITE, not merge-on-login. `getActor()` fires
 * `touchLastLogin` on every authenticated request, so a session hook would put a
 * two-table lookup on every page render; the identity it matches on only changes
 * when it is written.
 */
describe("the portal profile save links the contact (S-16)", () => {
  const actor = {kind: "member" as const, userId: "auth-1", profileId: "profile-1"};

  function deps(linkProfile: ReturnType<typeof vi.fn>) {
    return {
      profiles: {
        update: vi.fn(async (_actor: unknown, id: string, input: Record<string, unknown>) => ({
          id, email: "ada@example.hk", ...input,
        })),
      },
      companies: {getById: vi.fn(), update: vi.fn()},
      memberships: {list: vi.fn(async () => [{id: "m1", status: "active", companyId: null}])},
      contacts: {linkProfile},
    } as never;
  }

  it("passes the saved identity to the merge", async () => {
    const linkProfile = vi.fn(async () => ({linked: "c-1", matchedBy: "phone", candidates: []}));

    await updateProfile(actor, {displayName: "Ada", whatsappNumber: "+852 9123 4567", whatsappOptIn: true}, deps(linkProfile));

    expect(linkProfile).toHaveBeenCalledTimes(1);
    const [writerActor, input] = linkProfile.mock.calls[0] as unknown as [{kind: string}, Record<string, unknown>];
    expect(writerActor.kind).toBe("contact-writer");
    expect(input).toEqual({profileId: "profile-1", email: "ada@example.hk", phoneE164: "+85291234567"});
  });

  it("resolves the save even when the merge throws", async () => {
    const linkProfile = vi.fn(async () => { throw new Error("MERGE_EXPLODED"); });

    await expect(updateProfile(actor, {displayName: "Ada"}, deps(linkProfile)))
      .resolves.toMatchObject({id: "profile-1", displayName: "Ada"});
  });
});
