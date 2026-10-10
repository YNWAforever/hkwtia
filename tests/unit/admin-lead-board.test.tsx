import {render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {contactReturnPath} from "@/lib/admin/contact-action-core";
import type {BoardCard, ContactBoard} from "@/lib/db/repos/contacts";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

/**
 * Phase E, Task 8. `/admin/contacts?view=board` is the pipeline as columns.
 * Moving a card is the list's own stage form (`updateContactPipelineAction`),
 * so the board adds no mutation path; the overdue marker is a bundle string, so
 * it survives a monochrome screen.
 */
const actorProfileId = "22222222-2222-4222-8222-222222222222";
const contactId = "11111111-1111-4111-8111-111111111111";

const state = vi.hoisted(() => ({
  listBoard: vi.fn(),
  listContacts: vi.fn(),
}));

const bundles = {en: en.Admin.contacts, "zh-HK": zh.Admin.contacts} as const;

function translator(locale: "en" | "zh-HK") {
  return (key: string, values: Readonly<Record<string, string | number>> = {}) => {
    const found = key.split(".").reduce<unknown>(
      (node, part) => typeof node === "object" && node !== null ? (node as Record<string, unknown>)[part] : undefined,
      bundles[locale],
    );
    if (typeof found !== "string") throw new Error(`missing Admin.contacts.${key}`);
    return found.replaceAll(/\{(\w+)\}/g, (_m, name: string) => String(values[name] ?? ""));
  };
}

vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async ({locale}: {locale: "en" | "zh-HK"}) => translator(locale),
}));
vi.mock("@/lib/auth/server", () => ({getSession: async () => null}));
vi.mock("@/lib/admin/page-auth", () => ({
  requireAdminPageActor: async () => ({kind: "staff", userId: "staff-user", profileId: actorProfileId}),
}));
vi.mock("@/lib/admin/contacts", () => ({
  listContactBoard: (...args: unknown[]) => state.listBoard(...args),
  listContacts: (...args: unknown[]) => state.listContacts(...args),
}));
vi.mock("@/lib/admin/contact-actions", () => ({updateContactPipelineAction: vi.fn()}));
// The stub keeps `href` exactly as passed: the i18n Link takes an UNPREFIXED
// path and adds the locale itself, which is the property under test.
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

import AdminContactsPage from "@/app/[locale]/(admin)/admin/contacts/page";

function card(overrides: Partial<BoardCard> = {}): BoardCard {
  return {
    id: contactId, displayName: "Ada Wong", organisation: "Wong Logistics Ltd",
    source: "event_guest", ownerName: "Grace Staff", nextStep: "Call about the Startup plan",
    nextStepDueAt: null, inviteOpened: false, applied: false, ...overrides,
  };
}

function board(overrides: Partial<ContactBoard> = {}): ContactBoard {
  return {new: [], contacted: [], qualified: [], applied: [], member: [], closed: [], ...overrides};
}

async function renderBoard(locale: "en" | "zh-HK", search: Record<string, string> = {}) {
  return render(await AdminContactsPage({
    params: Promise.resolve({locale}),
    searchParams: Promise.resolve({view: "board", ...search}),
  }));
}

beforeEach(() => {
  state.listBoard.mockReset().mockResolvedValue(board());
  state.listContacts.mockReset();
});

describe.each([["en", en.Admin.contacts], ["zh-HK", zh.Admin.contacts]] as const)("the lead board in %s", (locale, text) => {
  it("renders New, Contacted, Qualified, Applied, Member in that order, and no Closed column by default", async () => {
    await renderBoard(locale);
    const headings = screen.getAllByRole("heading", {level: 2}).map((h) => h.textContent);
    expect(headings).toEqual([text.stage.new, text.stage.contacted, text.stage.qualified, text.stage.applied, text.stage.member]);
    expect(screen.queryByRole("heading", {name: text.stage.closed})).toBeNull();
    expect(state.listContacts).not.toHaveBeenCalled();
  });

  it("adds the Closed column, and asks the repository for it, only with the filter", async () => {
    await renderBoard(locale, {closed: "1"});
    expect(screen.getByRole("heading", {level: 2, name: text.stage.closed})).toBeInTheDocument();
    expect(state.listBoard.mock.calls[0]?.[1]).toMatchObject({includeClosed: true});
  });

  it("puts each card in its column, linking to the lead page by an unprefixed path", async () => {
    state.listBoard.mockResolvedValue(board({qualified: [card()]}));
    await renderBoard(locale);
    const column = screen.getByRole("heading", {level: 2, name: text.stage.qualified}).closest("section")!;
    const link = within(column).getByRole("link", {name: "Ada Wong"});
    expect(link).toHaveAttribute("href", `/admin/contacts/${contactId}`);
    expect(within(column).getByText("Wong Logistics Ltd")).toBeInTheDocument();
    expect(within(column).getByText("Call about the Startup plan")).toBeInTheDocument();
  });

  it("marks an overdue card with the bundle overdue text, and leaves a future one unmarked", async () => {
    state.listBoard.mockResolvedValue(board({contacted: [
      card({id: "a", displayName: "Late Lee", nextStepDueAt: new Date(Date.now() - 86_400_000)}),
      card({id: "b", displayName: "Early Eve", nextStepDueAt: new Date(Date.now() + 5 * 86_400_000)}),
    ]}));
    await renderBoard(locale);
    const late = screen.getByRole("link", {name: "Late Lee"}).closest("li")!;
    const early = screen.getByRole("link", {name: "Early Eve"}).closest("li")!;
    expect(within(late).getByText(text.board.overdue)).toBeInTheDocument();
    expect(within(early).queryByText(text.board.overdue)).toBeNull();
  });

  it("shows the invite-opened and applied signals only when they hold", async () => {
    state.listBoard.mockResolvedValue(board({applied: [
      card({id: "a", displayName: "Opened Ola", inviteOpened: true}),
      card({id: "b", displayName: "Plain Pat", applied: false}),
      card({id: "c", displayName: "Applied Amy", applied: true}),
    ]}));
    await renderBoard(locale);
    // The stage select also spells "Applied", so the signals are read from their own list.
    const signals = (name: string) => screen.getByRole("link", {name}).closest("li")!.querySelector("ul");
    expect(signals("Opened Ola")).toHaveTextContent(text.board.inviteOpened);
    expect(signals("Opened Ola")).not.toHaveTextContent(text.board.applied);
    expect(signals("Plain Pat")).toBeNull();
    expect(signals("Applied Amy")).toHaveTextContent(text.board.applied);
    expect(signals("Applied Amy")).not.toHaveTextContent(text.board.inviteOpened);
  });

  it("gives every card the list stage form: contactId, an allowlisted board returnTo, the stage select", async () => {
    state.listBoard.mockResolvedValue(board({new: [card()]}));
    await renderBoard(locale, {owner: "mine", overdue: "1"});
    const form = screen.getByRole("link", {name: "Ada Wong"}).closest("li")!.querySelector("form")!;
    expect(form.querySelector<HTMLInputElement>("input[name=contactId]")!.value).toBe(contactId);
    const returnTo = form.querySelector<HTMLInputElement>("input[name=returnTo]")!.value;
    expect(returnTo).toContain("?view=board");
    expect(returnTo).toContain("owner=mine");
    expect(returnTo).toContain("overdue=1");
    // The action allowlists this value before redirecting to it.
    expect(contactReturnPath(returnTo)).toBe(returnTo);
    const select = form.querySelector<HTMLSelectElement>("select[name=stage]")!;
    expect(select.value).toBe("new");
    expect([...select.options].map((o) => o.value)).toEqual(["new", "contacted", "qualified", "applied", "member", "closed"]);
  });

  it("resolves mine to the acting admin profile id, never from the URL", async () => {
    await renderBoard(locale, {owner: "mine"});
    expect(state.listBoard.mock.calls[0]?.[1]).toMatchObject({ownerProfileId: actorProfileId});
    state.listBoard.mockClear();
    await renderBoard(locale, {owner: "99999999-9999-4999-8999-999999999999"});
    expect(state.listBoard.mock.calls[0]?.[1]).toMatchObject({ownerProfileId: null});
  });

  it("passes source and overdue filters through, dropping an unknown source", async () => {
    await renderBoard(locale, {source: "whatsapp", overdue: "1"});
    expect(state.listBoard.mock.calls[0]?.[1]).toMatchObject({source: "whatsapp", overdueOnly: true});
    state.listBoard.mockClear();
    await renderBoard(locale, {source: "not-a-source"});
    expect(state.listBoard.mock.calls[0]?.[1]).not.toHaveProperty("source");
  });

  it("says so in a column with nobody in it", async () => {
    await renderBoard(locale);
    expect(screen.getAllByText(text.board.emptyColumn)).toHaveLength(5);
  });

  it("degrades to an alert, not a 500, when the board cannot load", async () => {
    state.listBoard.mockRejectedValue(new Error("db down"));
    await renderBoard(locale);
    expect(screen.getByRole("alert")).toHaveTextContent(text.board.error);
  });
});

describe("the board message bundles", () => {
  it("have the same keys in both languages", () => {
    const keys = (node: unknown, prefix = ""): string[] =>
      typeof node === "object" && node !== null
        ? Object.entries(node).flatMap(([k, v]) => keys(v, `${prefix}${k}.`))
        : [prefix];
    expect(keys(zh.Admin.contacts.board).sort()).toEqual(keys(en.Admin.contacts.board).sort());
  });
});
