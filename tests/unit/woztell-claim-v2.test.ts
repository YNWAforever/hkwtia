import {PgDialect} from "drizzle-orm/pg-core";
import {beforeEach, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));

vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import type {WoztellInboundClaimInput} from "@/lib/ai/woztell-webhook";
import type {
  AutomationDatabase,
  AutomationSqlExecutor,
} from "@/lib/db/repos/journeys";
import {createPostgresWoztellStore} from "@/lib/db/repos/woztell";

const NOW = new Date("2026-09-10T09:00:00.000Z");
const RECEIVED_AT = new Date("2026-09-10T08:59:30.000Z");
const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const CONTACT_ID = "22222222-2222-4222-8222-222222222222";
const RETENTION_MS = 365 * 24 * 60 * 60 * 1_000;

const dialect = new PgDialect();

function fakeDatabase(results: Record<string, unknown>[][]) {
  const queries: ReturnType<PgDialect["sqlToQuery"]>[] = [];
  const execute: AutomationSqlExecutor["execute"] = async (query) => {
    queries.push(dialect.sqlToQuery(query));
    return {rows: results.shift() ?? []};
  };
  const fake: AutomationDatabase = {
    execute,
    transaction: async (work) => work(fake),
  };
  database.current = fake;
  return {queries};
}

function claimInput(
  overrides: Partial<WoztellInboundClaimInput> = {},
): WoztellInboundClaimInput {
  return {
    owner: {kind: "anonymous", anonymousOwnerHash: "a".repeat(64)},
    profileId: null,
    locale: "en",
    memberName: "Member",
    whatsappOptIn: true,
    sender: "+85290000000",
    providerMessageId: "wamid.claim.v2",
    receivedAt: RECEIVED_AT,
    content: "Hello",
    channel: "whatsapp",
    whatsappMemberId: "woztell-member-1",
    contactId: CONTACT_ID,
    ...overrides,
  };
}

function normalized(statement: string | undefined): string {
  return (statement ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * The statement sequence `claimInbound` emits on a fresh claim, in order:
 * advisory lock, redelivery probe, conversation reuse probe, conversation
 * insert, message insert, conversation bump.
 */
function freshClaimResults(): Record<string, unknown>[][] {
  return [
    [],
    [],
    [],
    [{id: CONVERSATION_ID}],
    [{id: "33333333-3333-4333-8333-333333333333"}],
    [{handling: "bot", last_inbound_at: RECEIVED_AT}],
  ];
}

describe("WOZTELL inbound claim v2 (C-1 Task 3)", () => {
  beforeEach(() => {
    database.current = null;
  });

  it("writes the inbound row with an explicit direction rather than leaning on the column default", async () => {
    const fixture = fakeDatabase(freshClaimResults());

    await createPostgresWoztellStore(() => NOW).claimInbound(claimInput());

    const insert = fixture.queries.find((query) => /insert into "messages"/i.test(query.sql));
    expect(insert).toBeDefined();
    const sqlText = normalized(insert?.sql);
    expect(sqlText.slice(0, sqlText.indexOf(")"))).toContain("direction");
    // S-4's default is 'inbound', but a default is not a statement: a reader of
    // this row should not have to know the DDL to know which way it went.
    expect(sqlText).toContain("'inbound'");
    expect(sqlText).toContain(
      "on conflict (provider_message_id) where provider_message_id is not null do nothing",
    );
  });

  it("opens a conversation carrying its channel, handling state, contact link and window clock", async () => {
    const fixture = fakeDatabase(freshClaimResults());

    await createPostgresWoztellStore(() => NOW).claimInbound(claimInput());

    const insert = fixture.queries.find((query) => /insert into "conversations"/i.test(query.sql));
    expect(insert).toBeDefined();
    const sqlText = normalized(insert?.sql);
    for (const column of ["channel", "handling", "contact_id", "whatsapp_member_id", "last_inbound_at"]) {
      expect(sqlText, column).toContain(column);
    }
    expect(sqlText).toContain("'whatsapp'");
    expect(sqlText).toContain("'bot'");
    expect(insert?.params).toEqual(expect.arrayContaining([
      CONTACT_ID,
      "woztell-member-1",
      RECEIVED_AT,
    ]));
  });

  it("reuses a thread by the conversation's own channel, not by hunting for a prior inbound message", async () => {
    const fixture = fakeDatabase(freshClaimResults());

    await createPostgresWoztellStore(() => NOW).claimInbound(claimInput());

    const reuse = fixture.queries.find((query) => (
      normalized(query.sql).startsWith("select")
      && normalized(query.sql).includes(`from "conversations"`)
      && normalized(query.sql).includes("for update")
    ));
    expect(reuse).toBeDefined();
    const sqlText = normalized(reuse?.sql);
    expect(sqlText).toContain(`"conversations"."channel" = 'whatsapp'`);
    // The old predicate made a thread invisible until it already held an inbound
    // WhatsApp message, so a thread whose only WhatsApp rows are outbound got a
    // SECOND conversation opened for the same person — splitting the very thread
    // the inbox exists to unify.
    expect(sqlText).not.toContain("prior_message");
    expect(sqlText).toContain("handling");
    expect(sqlText).toContain("last_inbound_at");
  });

  it("extends the retention clock and fills the window state on every inbound", async () => {
    const fixture = fakeDatabase(freshClaimResults());

    await createPostgresWoztellStore(() => NOW).claimInbound(claimInput());

    const bump = fixture.queries.find((query) => /^\s*update "conversations"/i.test(query.sql));
    expect(bump).toBeDefined();
    const sqlText = normalized(bump?.sql);
    expect(sqlText).toMatch(/last_inbound_at = greatest\(/);
    expect(sqlText).toMatch(/whatsapp_member_id = coalesce\(/);
    expect(sqlText).toMatch(/contact_id = coalesce\(/);
    // Retention is 365 days after the LAST contact. expires_at used to be written
    // once at creation and never moved, so a thread running for 366 days was
    // eligible for deletion however active it was.
    expect(sqlText).toMatch(/expires_at = greatest\(/);
    expect(bump?.params).toEqual(expect.arrayContaining([
      new Date(NOW.getTime() + RETENTION_MS),
    ]));
  });

  it("returns the handling state and window clock the conversation actually holds", async () => {
    // A thread a person already took over. The webhook must see that from the
    // claim itself, because the decision not to wake the concierge hangs off it.
    // Reuse skips the conversation insert, so the sequence is one statement
    // shorter than a fresh claim's: lock, redelivery probe, reuse probe, message
    // insert, conversation bump.
    const fixture = fakeDatabase([
      [],
      [],
      [{id: CONVERSATION_ID, handling: "human", last_inbound_at: null, assigned_to_profile_id: "staff-a"}],
      [{id: "33333333-3333-4333-8333-333333333333"}],
      [{handling: "human", last_inbound_at: RECEIVED_AT, assigned_to_profile_id: "staff-a"}],
    ]);

    const claim = await createPostgresWoztellStore(() => NOW).claimInbound(claimInput());

    expect(claim).toMatchObject({
      status: "accepted",
      conversationId: CONVERSATION_ID,
      handling: "human",
      lastInboundAt: RECEIVED_AT,
      // C-1 Task 4: whom the human lane notifies. Read from the same locked row
      // as `handling`, because a second read is a second answer.
      assignedToProfileId: "staff-a",
    });
    expect(fixture.queries.some((query) => /insert into "conversations"/i.test(query.sql))).toBe(false);
  });

  it("reports the handling state on a redelivery too, so a retried inbound cannot wake the bot on a human thread", async () => {
    fakeDatabase([
      [],
      [{
        conversation_id: CONVERSATION_ID,
        metadata: {woztellState: "claimed", woztellLeaseUntil: "2026-09-10T08:00:00.000Z"},
      }],
      [{handling: "human", last_inbound_at: RECEIVED_AT, assigned_to_profile_id: "staff-a"}],
      [],
    ]);

    const claim = await createPostgresWoztellStore(() => NOW).claimInbound(claimInput());

    expect(claim).toMatchObject({
      status: "accepted",
      handling: "human",
      assignedToProfileId: "staff-a",
    });
  });

  it("reports an unassigned thread as null rather than inventing an assignee", async () => {
    const fixture = fakeDatabase(freshClaimResults());

    const claim = await createPostgresWoztellStore(() => NOW).claimInbound(claimInput());

    // staff_tasks.profile_id is nullable precisely so a prospect's unassigned
    // thread can still raise a task; a fabricated id would file it against a
    // person who never saw the thread.
    expect(claim).toMatchObject({status: "accepted", assignedToProfileId: null});
    const bump = fixture.queries.find((query) => /^\s*update "conversations"/i.test(query.sql));
    expect(normalized(bump?.sql)).toContain("assigned_to_profile_id");
  });
});
