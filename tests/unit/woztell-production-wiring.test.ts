import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));

vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {
  createProductionWoztellProcessorDependencies,
} from "@/lib/ai/woztell-production";
import type {ChannelAdapter} from "@/lib/channels/types";
import type {AiEnv, AppEnv} from "@/lib/config/env";
import {createPostgresWoztellStore} from "@/lib/db/repos/woztell";

const env: AppEnv & AiEnv = {
  appUrl: "https://hkwtia.example",
  agentsEnabled: false,
  agentModelConcierge: "test-model",
};

const dialect = new PgDialect();

/** The opt-in filter, as rendered SQL rather than as source text. */
const OPT_IN_FILTER = /"whatsapp_opt_in"\s*=\s*true/i;

/**
 * Installs a database that answers every query with no rows and keeps the SQL
 * it was asked for. `resolveProfile` returns null on an empty result, so both
 * resolvers run to completion and the statement is all we need.
 */
function capture() {
  const statements: string[] = [];
  database.current = {
    execute: async (query: unknown) => {
      statements.push(dialect.sqlToQuery(query as Parameters<PgDialect["sqlToQuery"]>[0]).sql);
      return {rows: []};
    },
  };
  return {sql: () => statements.join(" ")};
}

function channel(): ChannelAdapter {
  return {
    sendSessionMessage: vi.fn(async () => ({status: "sent" as const, providerId: "p"})),
    sendTemplateMessage: vi.fn(async () => ({status: "sent" as const, providerId: "p"})),
    normalizeInbound: vi.fn(() => ({
      kind: "unsupported" as const,
      sender: null,
      text: null,
      intent: null,
    })),
    verifyWebhook: vi.fn(() => true),
  };
}

/**
 * Every dependency Task 4 added is OPTIONAL on
 * `WoztellWebhookProcessorDependencies`, so the existing fixtures stay green —
 * and that is exactly the trap `recordContact` set when it was added the same
 * way: a `?.()` call on a key production wiring forgot is a silent no-op that no
 * test notices and the provider reports as success. Nothing else in the suite
 * constructs the production bag, so this is the only thing standing between a
 * forgotten spread and a permanently dropped delivery tick.
 */
describe("production WOZTELL processor wiring (C-1 Task 4)", () => {
  const dependencies = createProductionWoztellProcessorDependencies(env, channel());

  it.each([
    "recordDeliveryStatus",
    "recordOutboundEcho",
    "notifyAssignee",
    // C-1 Task 10. Forgetting this one is the quietest failure of the lot: the
    // send succeeds, the outbox says accepted, and the only symptom is that no
    // bot reply ever shows a tick — which C-9 would read as a provider problem.
    "stampOutbound",
    "recordContact",
    "recordOptOut",
    "claimInbound",
    "resolveProfile",
    "markCompleted",
  ] as const)("wires %s", (key) => {
    expect(typeof dependencies[key]).toBe("function");
  });

  it("keeps the profile resolver's own resolveProfile last, so an opted-out member stays a member", async () => {
    // `...store` then `...profileResolver` is load-bearing:
    // `store.resolveProfile` filters `WHERE profiles.whatsapp_opt_in = true` and
    // the resolver's does not, the later spread wins, and reversing them turns
    // an opted-out member into a stranger for whom a contact row is created and
    // the concierge answers. The new event-writer spread must therefore stay
    // after both, and must not shadow either.
    //
    // Asserted against the SQL the wired function actually emits, not against
    // its `toString()`. The first version of this test searched the source for
    // the literal `whatsapp_opt_in = true`, which appears in NEITHER resolver —
    // the store writes the filter as `${profiles.whatsappOptIn} = true` — so it
    // was green whichever way round the spreads went, which is the one thing it
    // existed to catch.
    const wired = capture();
    await dependencies.resolveProfile("+85290000000");
    expect(wired.sql()).not.toMatch(OPT_IN_FILTER);

    // The positive control, so the assertion above can never go vacuous again:
    // if the store's query stops carrying the filter this fails and says so,
    // rather than leaving a negative assertion that nothing can trip.
    const filtered = capture();
    await createPostgresWoztellStore(() => new Date()).resolveProfile("+85290000000");
    expect(filtered.sql()).toMatch(OPT_IN_FILTER);
  });
});
