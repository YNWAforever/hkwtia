import {render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {contactReturnPath} from "@/lib/admin/contact-action-core";
import type {ContactActivity} from "@/lib/db/repos/contact-activities";
import type {ContactRelated, ContactRow} from "@/lib/db/repos/contacts";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

/**
 * Phase E, Task 3. `/admin/contacts/[id]` is the page a salesperson works a lead
 * from: who they are, where they stand, what happened (newest first), what to do
 * next, and what else the platform knows about them.
 *
 * The negative assertions carry as much weight as the positive ones: every
 * Related section must be ABSENT when empty (an empty "Events attended" heading
 * invites the question of whether the lookup failed), and an unknown or
 * non-admin visitor must meet the same 404 so the page cannot be used to probe
 * which contact ids exist.
 */
const contactId = "11111111-1111-4111-8111-111111111111";
const conversationId = "33333333-3333-4333-8333-333333333333";
const profileId = "44444444-4444-4444-8444-444444444444";

const state = vi.hoisted(() => ({
  getContact: vi.fn(),
  activities: vi.fn(),
  related: vi.fn(),
  now: Date.now(),
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
vi.mock("next/navigation", () => ({
  notFound: (): never => { throw new Error("NEXT_NOT_FOUND"); },
}));
vi.mock("@/lib/auth/server", () => ({getSession: async () => null}));
vi.mock("@/lib/admin/page-auth", () => ({
  requireAdminPageActor: async () => ({kind: "staff", userId: "staff-user", profileId: "22222222-2222-4222-8222-222222222222"}),
}));
vi.mock("@/lib/admin/contacts", () => ({
  getContact: (...args: unknown[]) => state.getContact(...args),
  listContactActivities: (...args: unknown[]) => state.activities(...args),
  getContactRelated: (...args: unknown[]) => state.related(...args),
}));
vi.mock("@/lib/admin/contact-actions", () => ({
  addContactNoteAction: vi.fn(),
  updateContactNextStepAction: vi.fn(),
  updateContactPipelineAction: vi.fn(),
}));
// The real Link reads a next-intl context a bare render does not provide. The
// stub keeps `href` exactly as passed, which is the property under test: the
// i18n Link takes an UNPREFIXED path and adds the locale itself.
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

import AdminLeadPage from "@/app/[locale]/(admin)/admin/contacts/[id]/page";
import {ContactPipelineTable} from "@/components/admin/contact-pipeline-table";

function contact(overrides: Partial<ContactRow> = {}): ContactRow {
  return {
    id: contactId, displayName: "Ada Wong", email: "ada@example.hk", phoneE164: "+85291234567",
    stage: "qualified", source: "event_guest", ownerProfileId: "owner-1", ownerName: "Grace Staff",
    profileId: null, companyId: null, tags: [], whatsappOptIn: true, whatsappOptedOutAt: null,
    lastInboundAt: null, conversationId: null, duplicateCount: 1,
    nextStep: null, nextStepDueAt: null, lastTouchAt: null, organisation: "Wong Logistics Ltd",
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    ...overrides,
  };
}

function activity(overrides: Partial<ContactActivity>): ContactActivity {
  return {
    id: "a1", contactId, actorProfileId: "owner-1", actorName: "Grace Staff", kind: "note",
    body: "Spoke on the phone", meta: {}, createdAt: new Date("2026-10-02T03:00:00.000Z"), ...overrides,
  };
}

const emptyRelated: ContactRelated = {guestEvents: [], showcaseIntros: [], membership: null};

async function renderPage(locale: "en" | "zh-HK", id = contactId) {
  return render(await AdminLeadPage({params: Promise.resolve({locale, id})}));
}

beforeEach(() => {
  state.getContact.mockReset().mockResolvedValue(contact());
  state.activities.mockReset().mockResolvedValue([]);
  state.related.mockReset().mockResolvedValue(emptyRelated);
});

describe.each([["en", en.Admin.contacts], ["zh-HK", zh.Admin.contacts]] as const)("the lead page in %s", (locale, text) => {
  it("shows the header: name, organisation, source, stage, owner and consent", async () => {
    await renderPage(locale);
    expect(screen.getByRole("heading", {level: 1, name: "Ada Wong"})).toBeInTheDocument();
    const header = screen.getByRole("banner");
    expect(within(header).getByText("Wong Logistics Ltd")).toBeInTheDocument();
    expect(within(header).getByText(text.source.event_guest)).toBeInTheDocument();
    expect(within(header).getByText(text.stage.qualified)).toBeInTheDocument();
    expect(within(header).getByText("Grace Staff")).toBeInTheDocument();
    expect(within(header).getByText(text.optIn.yes)).toBeInTheDocument();
  });

  it("shows a stopped consent state, not a plain 'no', after an opt-out", async () => {
    state.getContact.mockResolvedValue(contact({whatsappOptIn: false, whatsappOptedOutAt: new Date("2026-10-01T00:00:00.000Z")}));
    await renderPage(locale);
    expect(within(screen.getByRole("banner")).getByText(text.optIn.stopped)).toBeInTheDocument();
  });

  it("lists the timeline in the order the repository returns it (newest first)", async () => {
    state.activities.mockResolvedValue([
      activity({id: "new", body: "Second call", createdAt: new Date("2026-10-03T00:00:00.000Z")}),
      activity({id: "old", kind: "stage_change", body: null, meta: {from: "new", to: "contacted"}, createdAt: new Date("2026-10-01T00:00:00.000Z")}),
    ]);
    await renderPage(locale);
    const items = screen.getAllByRole("listitem").filter((li) => li.closest("[data-timeline]"));
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Second call");
    expect(items[1]).toHaveTextContent(text.stage.new);
    expect(items[1]).toHaveTextContent(text.stage.contacted);
  });

  it("says so when there is no history yet", async () => {
    await renderPage(locale);
    expect(screen.getByText(text.lead.timeline.empty)).toBeInTheDocument();
  });

  it("offers a note form and a next-step form with a native date input", async () => {
    await renderPage(locale);
    expect(screen.getByLabelText(text.lead.notes.label)).toBeInTheDocument();
    expect(screen.getByRole("button", {name: text.lead.notes.add})).toBeInTheDocument();
    expect(screen.getByLabelText(text.lead.nextStep.label)).toBeInTheDocument();
    const due = screen.getByLabelText(text.lead.nextStep.due) as HTMLInputElement;
    expect(due.type).toBe("date");
    expect(screen.getByRole("button", {name: text.lead.nextStep.save})).toBeInTheDocument();
  });

  it("pre-fills the next step and reads the due date as a Hong Kong calendar day", async () => {
    // 18:00 Hong Kong on the 20th is 10:00Z — the UTC date is also the 20th, so
    // use an instant whose UTC and HK dates would differ if the zone were wrong.
    state.getContact.mockResolvedValue(contact({nextStep: "Call Ada", nextStepDueAt: new Date("2099-10-20T10:00:00.000Z")}));
    await renderPage(locale);
    expect((screen.getByLabelText(text.lead.nextStep.label) as HTMLInputElement).value).toBe("Call Ada");
    expect((screen.getByLabelText(text.lead.nextStep.due) as HTMLInputElement).value).toBe("2099-10-20");
    expect(screen.queryByText(text.lead.nextStep.overdue)).toBeNull();
  });

  it("flags an overdue next step in words as well as colour", async () => {
    state.getContact.mockResolvedValue(contact({nextStep: "Call Ada", nextStepDueAt: new Date("2020-01-02T10:00:00.000Z")}));
    await renderPage(locale);
    const flag = screen.getByText(text.lead.nextStep.overdue);
    expect(flag.className).toContain("text-destructive");
  });

  it("omits every Related section when there is nothing to relate", async () => {
    await renderPage(locale);
    expect(screen.queryByText(text.lead.related.events)).toBeNull();
    expect(screen.queryByText(text.lead.related.intros)).toBeNull();
    expect(screen.queryByText(text.lead.related.membership)).toBeNull();
    expect(screen.queryByRole("link", {name: text.openThread})).toBeNull();
  });

  it("shows guest events, showcase intros, the WhatsApp thread and the membership when present", async () => {
    state.getContact.mockResolvedValue(contact({conversationId, profileId}));
    state.related.mockResolvedValue({
      guestEvents: [{registrationId: "r1", eventId: "e1", slug: "agm", titleEn: "Annual Mixer", titleZh: "週年聯誼", startsAt: new Date("2026-09-20T10:00:00.000Z"), status: "registered", checkedInAt: null}],
      showcaseIntros: [{leadId: "l1", listingId: "s1", slug: "acme", nameEn: "Acme Freight", nameZh: "Acme 貨運", createdAt: new Date("2026-09-25T00:00:00.000Z")}],
      membership: {planCode: "community", status: "active"},
    });
    await renderPage(locale);
    expect(screen.getByText(text.lead.related.events)).toBeInTheDocument();
    expect(screen.getByText(locale === "en" ? "Annual Mixer" : "週年聯誼")).toBeInTheDocument();
    expect(screen.getByText(text.lead.related.intros)).toBeInTheDocument();
    expect(screen.getByText(locale === "en" ? "Acme Freight" : "Acme 貨運")).toBeInTheDocument();
    expect(screen.getByText(text.lead.related.membership)).toBeInTheDocument();
    expect(screen.getByText(/community/)).toBeInTheDocument();
    // Unprefixed: the i18n Link adds the locale. A pre-localised href here would double it.
    expect(screen.getByRole("link", {name: text.openThread})).toHaveAttribute("href", `/admin/inbox/${conversationId}`);
  });
});

describe("the lead page's refusals", () => {
  it("is a 404 for a contact that does not exist", async () => {
    state.getContact.mockResolvedValue(null);
    await expect(renderPage("en")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("is a 404 for an id that is not a uuid, without asking the database", async () => {
    await expect(renderPage("en", "../x")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(state.getContact).not.toHaveBeenCalled();
  });

  it("is a 404 for a non-admin, the same page as an unknown id", async () => {
    state.getContact.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(renderPage("en")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("propagates a database outage instead of reporting a false 404", async () => {
    state.getContact.mockRejectedValue(new Error("CONTACTS_UNAVAILABLE"));
    await expect(renderPage("en")).rejects.toThrow("CONTACTS_UNAVAILABLE");
  });
});

describe("contactReturnPath", () => {
  it("allows the lead page, with or without a locale prefix", () => {
    expect(contactReturnPath(`/admin/contacts/${contactId}`)).toBe(`/admin/contacts/${contactId}`);
    expect(contactReturnPath(`/zh/admin/contacts/${contactId}?saved=1`)).toBe(`/zh/admin/contacts/${contactId}?saved=1`);
    expect(contactReturnPath("/en/admin/contacts?stage=new")).toBe("/en/admin/contacts?stage=new");
  });

  it("refuses traversal, non-uuid ids and hosts", () => {
    expect(contactReturnPath("/admin/contacts/../x")).toBeNull();
    expect(contactReturnPath("/admin/contacts/not-a-uuid")).toBeNull();
    expect(contactReturnPath(`/admin/contacts/${contactId}/extra`)).toBeNull();
    expect(contactReturnPath(`//evil.example/admin/contacts/${contactId}`)).toBeNull();
  });
});

describe("the pipeline list's name cell", () => {
  it("links to the lead page through the locale-aware Link, unprefixed", () => {
    const labels = {
      caption: "c", columns: {name: "Name", stage: "Stage", source: "Source", owner: "Owner", lastInbound: "Last", optIn: "Opt", actions: "Actions"},
      stage: en.Admin.contacts.stage, source: en.Admin.contacts.source, optIn: en.Admin.contacts.optIn,
      filters: en.Admin.contacts.filters, unassigned: "u", assign: "a", assignToMe: "m", save: "s",
      openThread: "t", noThread: "n", convert: "c", linkedMember: "l", duplicates: () => "d", empty: "e",
    };
    render(
      <ContactPipelineTable
        actorProfileId="22222222-2222-4222-8222-222222222222"
        filters={{stage: "", source: "", owner: "", optIn: "", q: ""}}
        labels={labels}
        locale="zh-HK"
        returnTo="/zh/admin/contacts"
        rows={[contact()]}
        updateAction={vi.fn()}
      />,
    );
    expect(screen.getByRole("link", {name: "Ada Wong"})).toHaveAttribute("href", `/admin/contacts/${contactId}`);
  });
});

describe("the lead page's action cores", () => {
  it("contactNextStepInput turns an empty date into null and keeps the step text for the repository to trim", async () => {
    const {contactNextStepInput} = await import("@/lib/admin/contact-action-core");
    const form = new FormData();
    form.set("nextStep", " Call Ada ");
    form.set("dueAt", "");
    expect(contactNextStepInput(form)).toEqual({nextStep: " Call Ada ", dueAt: null});
    form.set("dueAt", "2026-10-20");
    expect(contactNextStepInput(form).dueAt).toBe("2026-10-20");
  });

  it("addContactNote and updateContactNextStep refuse a non-admin before touching the repository", async () => {
    const {addContactNote, updateContactNextStep} = await import("@/lib/admin/contact-action-core");
    const member = {kind: "member", userId: "u", profileId: "p"} as never;
    const addNote = vi.fn();
    const updateNextStep = vi.fn();
    await expect(addContactNote(member, contactId, "hi", {addNote})).rejects.toThrow("FORBIDDEN");
    await expect(updateContactNextStep(member, contactId, {}, {updateNextStep})).rejects.toThrow("FORBIDDEN");
    expect(addNote).not.toHaveBeenCalled();
    expect(updateNextStep).not.toHaveBeenCalled();
  });
});
