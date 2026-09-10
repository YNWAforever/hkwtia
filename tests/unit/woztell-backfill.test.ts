import {PgDialect} from "drizzle-orm/pg-core";
import {beforeEach, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));

vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {
  decideWoztellClaimState,
  type WoztellInboundClaimInput,
  type WoztellProfile,
} from "@/lib/ai/woztell-webhook";
import {
  createWoztellBackfillPost,
  type WoztellBackfillDependencies,
} from "@/lib/api/woztell-backfill-route";
import type {ChannelAdapter} from "@/lib/channels/types";
import {createWoztellAdapter} from "@/lib/channels/woztell";
import {
  historyEntryToWebhookEnvelope,
  WoztellOpenApiFailure,
  type ConversationHistoryPage,
  type WoztellOpenApiClient,
} from "@/lib/channels/woztell-open-api";
import type {
  AutomationDatabase,
  AutomationSqlExecutor,
} from "@/lib/db/repos/journeys";
import {
  createPostgresWoztellStore,
  woztellBackfillActor,
} from "@/lib/db/repos/woztell";
import {ANONYMOUS_ACTOR, type Actor} from "@/lib/membership/lifecycle";

const ADMIN: Actor = {
  kind: "staff",
  userId: "staff-a",
  profileId: "staff-a",
  role: "superadmin",
} as unknown as Actor;

const NOW = new Date("2026-09-11T09:00:00.000Z");
const RECEIVED_AT = new Date("2026-08-01T02:00:00.000Z");
const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const CONTACT_ID = "22222222-2222-4222-8222-222222222222";

const dialect = new PgDialect();

function historyEntry(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: "wamid.history.1",
    from: "85290000000",
    direction: "inbound",
    timestamp: "2026-08-01T02:00:00.000Z",
    text: "Hello from the backlog",
    ...overrides,
  };
}

function page(
  entries: readonly unknown[],
  endCursor: string | null,
  hasNextPage: boolean,
): ConversationHistoryPage {
  return {entries, endCursor, hasNextPage};
}

function fakeClient(pages: ConversationHistoryPage[]) {
  const calls: {after: string | null; first: number}[] = [];
  const client: WoztellOpenApiClient = {
    async conversationHistory(input) {
      calls.push({after: input.after, first: input.first});
      return pages.shift() ?? page([], null, false);
    },
  };
  return {calls, client};
}

/**
 * The real adapter, with no credentials at all, and both send methods spied.
 * Plan Task 11 Step 1's load-bearing assertion is that the backfill starts no
 * send and no bot turn: `claimInbound` is what starts a turn, and reaching it
 * from a second boundary with no HMAC in front of it is how a backfill becomes a
 * mass re-reply. A credential-free adapter cannot send live even if something
 * did call it; the spies prove nothing tried.
 */
function spiedChannel() {
  const adapter = createWoztellAdapter({});
  const channel: ChannelAdapter = {
    normalizeInbound: vi.fn(adapter.normalizeInbound),
    sendSessionMessage: vi.fn(adapter.sendSessionMessage),
    sendTemplateMessage: vi.fn(adapter.sendTemplateMessage),
    verifyWebhook: adapter.verifyWebhook,
  };
  return channel;
}

type Harness = Readonly<{
  post: (request: Request) => Promise<Response>;
  channel: ChannelAdapter;
  calls: {after: string | null; first: number}[];
  createClient: ReturnType<typeof vi.fn>;
  recordContact: ReturnType<typeof vi.fn>;
  importInbound: ReturnType<typeof vi.fn>;
  resolveProfile: ReturnType<typeof vi.fn>;
  imported: WoztellInboundClaimInput[];
}>;

function harness(
  pages: ConversationHistoryPage[],
  overrides: Partial<WoztellBackfillDependencies> = {},
): Harness {
  const {calls, client} = fakeClient(pages);
  const channel = spiedChannel();
  const createClient = vi.fn(() => client);
  const recordContact = vi.fn(async () => ({id: CONTACT_ID}));
  const imported: WoztellInboundClaimInput[] = [];
  const importInbound = vi.fn(async (input: WoztellInboundClaimInput) => {
    imported.push(input);
    return "imported" as const;
  });
  const resolveProfile = vi.fn(async (): Promise<WoztellProfile | null> => null);
  const post = createWoztellBackfillPost({
    actor: async () => ADMIN,
    openApiToken: () => "open-api-token",
    createClient,
    channel,
    resolveProfile,
    anonymousOwnerHash: (sender) => `hash:${sender}`,
    recordContact,
    importInbound,
    pageSize: 25,
    ...overrides,
  });
  return {
    post,
    channel,
    calls,
    createClient,
    recordContact,
    importInbound,
    resolveProfile,
    imported,
  };
}

function backfillRequest(body: Readonly<Record<string, unknown>> = {}): Request {
  return new Request("https://app.test/api/admin/woztell/backfill", {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify(body),
  });
}

async function jsonBody(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

describe("WOZTELL history backfill route (C-3 Task 11)", () => {
  it("refuses a caller the session layer will not authorise, before it reads the token", async () => {
    const openApiToken = vi.fn(() => "open-api-token");
    const {post, createClient} = harness([], {
      actor: async () => {
        throw new Error("UNAUTHORIZED");
      },
      openApiToken,
    });

    const response = await post(backfillRequest());

    expect(response.status).toBe(404);
    // Authorisation first, configuration second: a 503 here would tell an
    // unauthenticated caller whether the Open API token is set.
    expect(openApiToken).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("refuses a member actor the same way it refuses an anonymous one", async () => {
    for (const actor of [ANONYMOUS_ACTOR, {kind: "member", userId: "u", profileId: "u"} as Actor]) {
      const {post, createClient} = harness([], {actor: async () => actor});
      const response = await post(backfillRequest());
      expect(response.status).toBe(404);
      expect(createClient).not.toHaveBeenCalled();
    }
  });

  it("answers 503 BACKFILL_NOT_CONFIGURED when the Open API token is blank", async () => {
    const {post, createClient} = harness([], {openApiToken: () => "   "});

    const response = await post(backfillRequest());

    expect(response.status).toBe(503);
    expect(await jsonBody(response)).toEqual({error: "BACKFILL_NOT_CONFIGURED"});
    expect(createClient).not.toHaveBeenCalled();
  });

  it("stops at hasNextPage:false and passes each page's endCursor to the next request", async () => {
    const {post, calls} = harness([
      page([historyEntry({id: "wamid.history.1"})], "cursor-1", true),
      page([historyEntry({id: "wamid.history.2"})], "cursor-2", false),
    ]);

    const response = await post(backfillRequest({after: "cursor-0", pages: 5}));

    expect(response.status).toBe(200);
    expect(calls).toEqual([
      {after: "cursor-0", first: 25},
      {after: "cursor-1", first: 25},
    ]);
    expect(await jsonBody(response)).toMatchObject({
      imported: 2,
      duplicates: 0,
      skipped: 0,
      endCursor: "cursor-2",
      hasNextPage: false,
    });
  });

  it("stops at the requested page cap and hands the cursor back so the next call resumes", async () => {
    const {post, calls} = harness([
      page([historyEntry({id: "wamid.history.1"})], "cursor-1", true),
      page([historyEntry({id: "wamid.history.2"})], "cursor-2", true),
      page([historyEntry({id: "wamid.history.3"})], "cursor-3", true),
    ]);

    const response = await post(backfillRequest({pages: 2}));

    expect(calls).toHaveLength(2);
    expect(await jsonBody(response)).toMatchObject({
      imported: 2,
      endCursor: "cursor-2",
      hasNextPage: true,
    });
  });

  it("runs every entry through the adapter's own normaliser rather than a second one", async () => {
    const {post, channel, imported} = harness([
      page([historyEntry({memberId: "  member-9001  "})], null, false),
    ]);

    await post(backfillRequest());

    expect(channel.normalizeInbound).toHaveBeenCalledTimes(1);
    expect(channel.normalizeInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "TEXT",
        from: "85290000000",
        messageId: "wamid.history.1",
        data: {text: "Hello from the backlog"},
      }),
    );
    expect(imported).toEqual([expect.objectContaining({
      sender: "+85290000000",
      providerMessageId: "wamid.history.1",
      content: "Hello from the backlog",
      channel: "whatsapp",
      // The normaliser trims the padded member id; the importer stores it on the
      // conversation, which carries no unique index on it.
      whatsappMemberId: "member-9001",
      contactId: CONTACT_ID,
      owner: {kind: "anonymous", anonymousOwnerHash: "hash:+85290000000"},
    })]);
  });

  it("counts an unreadable entry as skipped instead of throwing the whole page away", async () => {
    const {post, importInbound} = harness([
      page([
        // No text at all: `normalizeInbound` answers `unsupported`.
        historyEntry({id: "wamid.history.1", text: null}),
        // An echo of our own outbound reply must never be imported as an
        // inbound `role: 'user'` row.
        historyEntry({id: "wamid.history.2", direction: "outbound"}),
        // Not an object.
        "not-an-entry",
        historyEntry({id: "wamid.history.3"}),
      ], null, false),
    ]);

    const response = await post(backfillRequest());

    expect(response.status).toBe(200);
    expect(await jsonBody(response)).toMatchObject({imported: 1, skipped: 3});
    expect(importInbound).toHaveBeenCalledTimes(1);
  });

  it("counts a number that will not normalise as skipped and never reaches the importer", async () => {
    const {post, importInbound, recordContact} = harness([
      page([historyEntry({from: "123"})], null, false),
    ]);

    expect(await jsonBody(await post(backfillRequest()))).toMatchObject({
      imported: 0,
      skipped: 1,
      contacts: 0,
    });
    expect(recordContact).not.toHaveBeenCalled();
    expect(importInbound).not.toHaveBeenCalled();
  });

  it("resolves the contact before importing, so the imported thread is not invisible to /admin/contacts", async () => {
    const {post, recordContact} = harness([
      page([historyEntry()], null, false),
    ]);

    expect(await jsonBody(await post(backfillRequest()))).toMatchObject({contacts: 1});
    expect(recordContact).toHaveBeenCalledWith({
      phoneE164: "+85290000000",
      locale: "en",
      receivedAt: RECEIVED_AT,
      whatsappMemberId: null,
    });
  });

  it("owns a known member's thread the way the webhook does, so the next inbound reuses it", async () => {
    const profile: WoztellProfile = {
      id: "profile-1",
      displayName: "Ada Wong",
      locale: "zh-HK",
      whatsappOptIn: false,
    };
    const {post, recordContact, imported} = harness([
      page([historyEntry()], null, false),
    ], {resolveProfile: async () => profile});

    await post(backfillRequest());

    // The webhook creates no contact row for a member; neither may the backfill,
    // or the same person is a member in one table and a prospect in another.
    expect(recordContact).not.toHaveBeenCalled();
    expect(imported[0]).toMatchObject({
      owner: {kind: "profile", profileId: "profile-1"},
      profileId: "profile-1",
      locale: "zh-HK",
      contactId: null,
    });
  });

  it("counts a row the importer has already seen as a duplicate rather than an import", async () => {
    const {post} = harness([
      page([historyEntry({id: "wamid.history.1"}), historyEntry({id: "wamid.history.2"})], null, false),
    ], {importInbound: vi.fn(async () => "duplicate" as const)});

    expect(await jsonBody(await post(backfillRequest()))).toMatchObject({
      imported: 0,
      duplicates: 2,
    });
  });

  it("never sends and never starts a bot turn", async () => {
    const {post, channel} = harness([
      page([historyEntry({id: "wamid.history.1"}), historyEntry({id: "wamid.history.2"})], null, false),
    ]);

    await post(backfillRequest());

    expect(channel.sendSessionMessage).not.toHaveBeenCalled();
    expect(channel.sendTemplateMessage).not.toHaveBeenCalled();
  });

  it("rejects a body the schema does not recognise without calling the provider", async () => {
    const {post, createClient} = harness([]);

    const response = await post(new Request("https://app.test/api/admin/woztell/backfill", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({pages: 999, unexpected: true}),
    }));

    expect(response.status).toBe(400);
    expect(await jsonBody(response)).toEqual({error: "INVALID_REQUEST"});
    expect(createClient).not.toHaveBeenCalled();
  });

  it("answers 502 when the provider call fails, so a retry is a decision and not a loop", async () => {
    const {post} = harness([], {
      createClient: () => ({
        async conversationHistory() {
          throw new WoztellOpenApiFailure("provider_unreachable");
        },
      }),
    });

    const response = await post(backfillRequest());

    expect(response.status).toBe(502);
    expect(await jsonBody(response)).toEqual({error: "BACKFILL_PROVIDER_FAILED"});
  });

  it("keeps a failure inside the tree apart from a failure at the provider", async () => {
    const {post} = harness([page([historyEntry()], null, false)], {
      importInbound: vi.fn(async () => {
        throw new Error("WOZTELL_CONVERSATION_CREATE_FAILED");
      }),
    });

    const response = await post(backfillRequest());

    expect(response.status).toBe(500);
    expect(await jsonBody(response)).toEqual({error: "BACKFILL_FAILED"});
  });
});

describe("WOZTELL history entry mapping (C-3, plan O-2)", () => {
  it("produces the pre-Phase-C inbound envelope so there is exactly one normaliser", () => {
    expect(historyEntryToWebhookEnvelope(historyEntry({memberId: "member-9001"}))).toEqual({
      type: "TEXT",
      from: "85290000000",
      messageId: "wamid.history.1",
      timestamp: "2026-08-01T02:00:00.000Z",
      data: {text: "Hello from the backlog"},
      memberId: "member-9001",
    });
  });

  it("refuses an entry that declares itself outbound, whatever else it carries", () => {
    for (const marker of ["outbound", "OUT", "bot", "MANUAL", "relay"]) {
      expect(historyEntryToWebhookEnvelope(historyEntry({direction: marker})), marker).toBeNull();
    }
  });

  it("refuses anything missing a field the normaliser would need", () => {
    expect(historyEntryToWebhookEnvelope(null)).toBeNull();
    expect(historyEntryToWebhookEnvelope("entry")).toBeNull();
    for (const missing of ["from", "id", "timestamp", "text"] as const) {
      expect(historyEntryToWebhookEnvelope(historyEntry({[missing]: undefined})), missing).toBeNull();
    }
  });
});

/**
 * The statement sequence `importHistoricalInbound` emits on a fresh import, in
 * order: advisory lock, redelivery probe, conversation reuse probe, conversation
 * insert, message insert, conversation bump.
 */
function freshImportResults(): Record<string, unknown>[][] {
  return [
    [],
    [],
    [],
    [{id: CONVERSATION_ID}],
    [{id: "33333333-3333-4333-8333-333333333333"}],
    [{id: CONVERSATION_ID}],
  ];
}

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

function importInput(
  overrides: Partial<WoztellInboundClaimInput> = {},
): WoztellInboundClaimInput {
  return {
    owner: {kind: "anonymous", anonymousOwnerHash: "a".repeat(64)},
    profileId: null,
    locale: "en",
    memberName: "Member",
    whatsappOptIn: true,
    sender: "+85290000000",
    providerMessageId: "wamid.history.1",
    receivedAt: RECEIVED_AT,
    content: "Hello from the backlog",
    channel: "whatsapp",
    whatsappMemberId: null,
    contactId: CONTACT_ID,
    ...overrides,
  };
}

function normalized(statement: string | undefined): string {
  return (statement ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

describe("importHistoricalInbound (C-3 Task 11 Step 5)", () => {
  beforeEach(() => {
    database.current = null;
  });

  it("refuses every actor that is not its own capability, before it opens the database", async () => {
    const store = createPostgresWoztellStore(() => NOW, async () => {
      throw new Error("DATABASE_OPENED");
    });

    for (const forged of [
      ANONYMOUS_ACTOR,
      {kind: "member", userId: "u", profileId: "u"},
      {kind: "staff", userId: "staff-a", profileId: "staff-a", role: "superadmin"},
      // The shape a forged actor takes if `kind` alone were the check, and the
      // webhook's own capability: one entry point, one symbol.
      {kind: "woztell-backfill", userId: null},
      {kind: "woztell-webhook", userId: null},
    ]) {
      await expect(
        store.importHistoricalInbound(forged as never, importInput()),
      ).rejects.toThrow("FORBIDDEN");
    }
  });

  it("writes a completed row that no bot turn can ever start from", async () => {
    const fixture = fakeDatabase(freshImportResults());

    const outcome = await createPostgresWoztellStore(() => NOW)
      .importHistoricalInbound(woztellBackfillActor(), importInput());

    expect(outcome).toBe("imported");
    const insert = fixture.queries.find((query) => /insert into "messages"/i.test(query.sql));
    expect(insert).toBeDefined();
    const sqlText = normalized(insert?.sql);
    expect(sqlText.slice(0, sqlText.indexOf(")"))).toContain("direction");
    expect(sqlText).toContain("'inbound'");
    expect(sqlText).toContain(
      "on conflict (provider_message_id) where provider_message_id is not null do nothing",
    );
    const metadata = insert?.params.find(
      (param): param is string => typeof param === "string" && param.includes("woztellState"),
    );
    expect(metadata).toBeDefined();
    const parsed = JSON.parse(metadata ?? "{}") as Record<string, unknown>;
    expect(parsed).toEqual({
      locale: "en",
      normalizedSender: "+85290000000",
      woztellState: "completed",
    });
    // The lease and the run id are the two fields that make a row resumable.
    expect(parsed.woztellLeaseUntil).toBeUndefined();
    expect(parsed.woztellRunId).toBeUndefined();
    expect(decideWoztellClaimState({
      state: "completed",
      leaseUntil: null,
      now: NOW,
    })).toBe("duplicate");
  });

  it("reuses the conversation the webhook would reuse, on the conversation's own channel", async () => {
    const fixture = fakeDatabase([
      [],
      [],
      [{id: CONVERSATION_ID}],
      [{id: "33333333-3333-4333-8333-333333333333"}],
      [{id: CONVERSATION_ID}],
    ]);

    await createPostgresWoztellStore(() => NOW)
      .importHistoricalInbound(woztellBackfillActor(), importInput());

    const reuse = fixture.queries.find((query) => /select .* from "conversations"/is.test(query.sql));
    const sqlText = normalized(reuse?.sql);
    expect(sqlText).toContain('"channel" = \'whatsapp\'');
    expect(sqlText).toContain("for update");
    expect(fixture.queries.some((query) => /insert into "conversations"/i.test(query.sql))).toBe(false);
  });

  it("reports duplicate for a provider id the tree already carries, without touching the row", async () => {
    const fixture = fakeDatabase([
      [],
      [{conversation_id: CONVERSATION_ID, metadata: {woztellState: "completed"}}],
    ]);

    const outcome = await createPostgresWoztellStore(() => NOW)
      .importHistoricalInbound(woztellBackfillActor(), importInput());

    expect(outcome).toBe("duplicate");
    expect(fixture.queries.some((query) => /^update /i.test(query.sql.trim()))).toBe(false);
    expect(fixture.queries.some((query) => /insert into/i.test(query.sql))).toBe(false);
  });

  it("reports duplicate when the ON CONFLICT arm swallows a concurrent insert", async () => {
    const results = freshImportResults();
    results[4] = [];
    fakeDatabase(results);

    await expect(
      createPostgresWoztellStore(() => NOW)
        .importHistoricalInbound(woztellBackfillActor(), importInput()),
    ).resolves.toBe("duplicate");
  });
});
