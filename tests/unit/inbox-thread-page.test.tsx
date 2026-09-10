import {render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {InboxConversationSummary} from "@/lib/db/repos/inbox";
import en from "@/messages/en.json";

/**
 * C1 Task 8 Step 5, and one review finding against it.
 *
 * `setHandling` refuses `handling='human'` on a thread whose channel is not
 * `whatsapp` (`INVALID_INBOX_CHANNEL`, lib/db/repos/inbox.ts) — a web widget
 * thread has no number behind it and no customer-service window, so a person
 * who took it over would hold a composer that cannot send. The take-over button
 * shipped ungated, and `setInboxHandlingAction` returns `void`: unlike the reply
 * action it has no `useActionState` channel to carry a code back, so the refusal
 * arrived as the generic `app/[locale]/error.tsx` boundary with the page state
 * gone, on a control that could never have succeeded for that thread. The
 * composer twelve lines below already applied this rule to itself — "a box that
 * can only produce an error is worse than no box" — and this file is what stops
 * the button drifting back out of agreement with it.
 *
 * The negative assertions are the point: three of the four cases are about a
 * control that must NOT be on the page.
 */
const staffProfileId = "22222222-2222-4222-8222-222222222222";
const conversationId = "11111111-1111-4111-8111-111111111111";

const state = vi.hoisted(() => ({
  transcript: vi.fn(),
  setHandling: vi.fn(),
  assign: vi.fn(),
  markRead: vi.fn(),
  close: vi.fn(),
  reply: vi.fn(),
}));

/**
 * Resolves against the real bundle rather than echoing the key, so a key the
 * page asks for and neither bundle carries fails here as well as in
 * `audit:strings`. `{hours}`/`{minutes}` are interpolated because
 * `Admin.inbox.window.open` takes them.
 */
function translate(key: string, values: Readonly<Record<string, string>> = {}): string {
  const found = key.split(".").reduce<unknown>(
    (node, part) => (typeof node === "object" && node !== null ? (node as Record<string, unknown>)[part] : undefined),
    en.Admin.inbox,
  );
  if (typeof found !== "string") throw new Error(`missing Admin.inbox.${key}`);
  return found.replaceAll(/\{(\w+)\}/g, (_match, name: string) => values[name] ?? "");
}

vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async () => translate,
}));
vi.mock("next/navigation", () => ({
  notFound: (): never => { throw new Error("NEXT_NOT_FOUND"); },
}));
vi.mock("@/lib/admin/page-auth", () => ({
  requireAdminPageActor: async () => ({kind: "staff", userId: "staff-user", profileId: staffProfileId}),
}));
vi.mock("@/lib/admin/inbox", () => ({
  readTranscript: (...args: readonly unknown[]) => state.transcript(...args),
}));
// The `"use server"` module: mocked so the page under test binds a plain
// function rather than reaching for a session and a database.
vi.mock("@/lib/admin/inbox-actions", () => ({
  assignInboxConversationAction: state.assign,
  closeInboxConversationAction: state.close,
  markInboxReadAction: state.markRead,
  sendInboxReplyAction: state.reply,
  setInboxHandlingAction: state.setHandling,
}));
// `tests/unit/inbox-composer.test.tsx` renders the real one; here it only needs
// to be findable, so its `useActionState` stays out of this render.
vi.mock("@/components/admin/inbox-composer", () => ({
  InboxComposer: () => <form aria-label="composer" />,
}));

import AdminInboxThreadPage from "@/app/[locale]/(admin)/admin/inbox/[id]/page";

const now = new Date("2026-09-10T00:00:00.000Z");

function conversation(overrides: Partial<InboxConversationSummary>): InboxConversationSummary {
  return {
    id: conversationId,
    channel: "web",
    locale: "en",
    status: "open",
    handling: "bot",
    ownerLabel: "A prospect",
    profileId: null,
    contactId: null,
    assignedToProfileId: null,
    assigneeLabel: null,
    lastMessage: "Hello",
    lastMessageAt: now,
    lastInboundAt: now,
    lastStaffReadAt: null,
    unread: false,
    messageCount: 1,
    escalated: false,
    ...overrides,
  };
}

async function page(overrides: Partial<InboxConversationSummary>) {
  state.transcript.mockResolvedValue({conversation: conversation(overrides), messages: []});
  return render(await AdminInboxThreadPage({params: Promise.resolve({locale: "en", id: conversationId})}));
}

const take = en.Admin.inbox.actions.take;
const release = en.Admin.inbox.actions.release;

describe("the admin inbox thread page", () => {
  beforeEach(() => {
    state.transcript.mockReset();
  });

  it("does not offer to take over a web thread, which setHandling refuses", async () => {
    await page({channel: "web", handling: "bot"});
    expect(screen.queryByRole("button", {name: take})).toBeNull();
    // The same reason hides the composer, so a web thread has neither control.
    expect(screen.queryByLabelText("composer")).toBeNull();
    // The rest of the toolbar is unaffected: a web thread is still assignable
    // and still closable.
    expect(screen.getByRole("button", {name: en.Admin.inbox.actions.assignToMe})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: en.Admin.inbox.actions.close})).toBeInTheDocument();
  });

  it("offers to take over a whatsapp thread the concierge still holds", async () => {
    await page({channel: "whatsapp", handling: "bot"});
    expect(screen.getByRole("button", {name: take})).toBeInTheDocument();
    // Taking it over is what reveals the composer, so it is not there yet.
    expect(screen.queryByLabelText("composer")).toBeNull();
  });

  it("swaps take-over for release once a person holds the thread", async () => {
    await page({channel: "whatsapp", handling: "human"});
    expect(screen.queryByRole("button", {name: take})).toBeNull();
    expect(screen.getByRole("button", {name: release})).toBeInTheDocument();
    expect(screen.getByLabelText("composer")).toBeInTheDocument();
  });

  it("keeps release available on a human-handled web thread", async () => {
    // Only a whatsapp thread can reach `human` through the UI, but handing a
    // thread back is `handling='bot'`, which the repository accepts on either
    // channel — gating release too would strand a row that got there another way.
    await page({channel: "web", handling: "human"});
    expect(screen.getByRole("button", {name: release})).toBeInTheDocument();
  });
});
