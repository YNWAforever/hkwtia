import {beforeEach, describe, expect, it, vi} from "vitest";

import type {InboxReplyResult} from "@/lib/admin/inbox-action-core";

/**
 * C-2(b). The `"use server"` wrapper is the last place the send's outcome can
 * be told truthfully, and it was the place that stopped telling it.
 *
 * `sendInboxReply` answers with a DISCRIMINATOR — `sent` means the adapter took
 * this reply, `already_sent` means a row under the same `outbound_key` had
 * already settled and the adapter was never called. The action flattened both
 * to `{status: "sent"}`, so the composer rendered `Admin.inbox.compose.sent` —
 * "Sent." — and cleared the draft for a reply that never left the building.
 */

const core = vi.hoisted(() => ({
  result: {status: "sent", messageId: "message-1"} as InboxReplyResult,
  calls: 0,
}));
const auth = vi.hoisted(() => ({notFoundCalls: 0}));

vi.mock("next/cache", () => ({revalidatePath: vi.fn()}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    auth.notFoundCalls += 1;
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/auth/actor", () => ({
  requireAdminActor: async () => ({kind: "staff", userId: "staff-user", profileId: "staff-1"}),
}));
vi.mock("@/lib/admin/inbox-action-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/inbox-action-core")>()),
  sendInboxReply: async () => {
    core.calls += 1;
    return core.result;
  },
}));

import {sendInboxReplyAction} from "@/lib/admin/inbox-actions";

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";

function form(): FormData {
  const data = new FormData();
  data.set("conversationId", CONVERSATION_ID);
  data.set("kind", "session");
  data.set("content", "Thanks — someone will come back to you shortly.");
  return data;
}

describe("sendInboxReplyAction", () => {
  beforeEach(() => {
    core.calls = 0;
    auth.notFoundCalls = 0;
  });

  it("reports a send that reached the adapter as sent", async () => {
    core.result = {status: "sent", messageId: "message-1"};
    await expect(sendInboxReplyAction("/en/admin/inbox/1", {status: "idle"}, form()))
      .resolves.toEqual({status: "sent", messageId: "message-1"});
    expect(core.calls).toBe(1);
  });

  it("never reports an already-sent row as sent", async () => {
    // The whole defect in one assertion. `already_sent` means the member got
    // nothing from THIS attempt; reported as "Sent." it is a lost reply dressed
    // as a success, and the composer clears the draft on the way out.
    core.result = {status: "already_sent", messageId: "message-1"};
    await expect(sendInboxReplyAction("/en/admin/inbox/1", {status: "idle"}, form()))
      .resolves.toEqual({status: "already_sent", messageId: "message-1"});
  });
});
