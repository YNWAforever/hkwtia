import {describe, expect, it, vi} from "vitest";

import {createInboxRepository} from "@/lib/db/repos/inbox";

const admin = {kind: "staff" as const, userId: "u", profileId: "staff-1"};
const member = {kind: "member" as const, userId: "u2", profileId: "member-1"};

function database(rows: Record<string, unknown>[]) {
  return {execute: vi.fn(async () => rows), transaction: vi.fn()};
}

describe("inboxRepository", () => {
  it("refuses non-admin actors", async () => {
    const repository = createInboxRepository(async () => database([]) as never);
    await expect(repository.listConversations(member, {channel: "all", limit: 50})).rejects.toThrow();
    await expect(repository.getTranscript(member, "11111111-1111-4111-8111-111111111111")).rejects.toThrow();
  });

  it("maps conversation summaries with channel, owner label and escalation flag", async () => {
    const repository = createInboxRepository(async () => database([{
      id: "11111111-1111-4111-8111-111111111111", agent_kind: "concierge", locale: "en", status: "active",
      last_message_at: new Date("2026-09-08T00:00:00Z"), profile_id: null, display_name: null,
      // C-1 Task 1 gave the conversation its own channel and handling state; the
      // summary reads them from the row rather than deriving either.
      channel: "whatsapp", handling: "bot", last_message: "Hello", message_count: 2, open_task_count: 1,
    }]) as never);
    const rows = await repository.listConversations(admin, {channel: "whatsapp", limit: 50});
    expect(rows).toEqual([expect.objectContaining({id: "11111111-1111-4111-8111-111111111111", channel: "whatsapp", handling: "bot", ownerLabel: null, lastMessage: "Hello", messageCount: 2, escalated: true, unread: true})]);
  });

  it("rejects an out-of-range limit and a non-uuid conversation id before touching the database", async () => {
    const store = database([]);
    const repository = createInboxRepository(async () => store as never);
    await expect(repository.listConversations(admin, {channel: "all", limit: 5000})).rejects.toThrow();
    await expect(repository.getTranscript(admin, "not-a-uuid")).rejects.toThrow();
    expect(store.execute).not.toHaveBeenCalled();
  });
});
