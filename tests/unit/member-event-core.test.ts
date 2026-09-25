import {describe, expect, it, vi} from "vitest";

import {listMyCompanyEvents, loadMemberEventsContext, saveMemberEvent} from "@/lib/events/member-core";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const EVENT = "22222222-2222-4222-8222-222222222222";
const member = {kind: "member" as const, userId: "u", profileId: "member-1"};

const input = {
  slug: "ai-clinic-2026", titleEn: "AI Clinic", titleZh: null, descriptionEn: "d", descriptionZh: null,
  startsAt: new Date("2030-03-01T02:00:00Z"), endsAt: null, venue: null, capacity: null, format: "in_person" as const,
  onlineUrl: null, visibility: "public" as const, registrationMode: "rsvp" as const, externalRegistrationUrl: null, tags: [], heroMediaId: null,
};

function deps(plan = "startup") {
  return {
    events: {
      saveMemberDraft: vi.fn(async () => ({id: "e1", status: "draft"})),
      submitMember: vi.fn(async () => ({id: "e1", status: "pending_review"})),
      countCompanySubmissionsThisQuarter: vi.fn<(actor: unknown, company: unknown, options?: {excludeEventId?: string}) => Promise<number>>(async () => 1),
      listForCompany: vi.fn(async () => []),
      getForMemberEdit: vi.fn(async () => ({organiser_company_id: COMPANY})),
    },
    dashboard: vi.fn(async () => ({
      companies: [{id: COMPANY, canManage: true, displayName: "Acme"}],
      memberships: [{planCode: plan, status: "active", companyId: COMPANY}],
    })),
  };
}

describe("member event core (programme B-2)", () => {
  it("resolves the member's company, plan and remaining quota", async () => {
    const d = deps();
    const context = await loadMemberEventsContext(member, d as never);
    expect(context).toMatchObject({companyId: COMPANY, companyName: "Acme", plan: "startup", usedThisQuarter: 1, limit: 2, canPublish: true});
    expect(d.events.countCompanySubmissionsThisQuarter).toHaveBeenCalledWith(member, COMPANY, undefined);
  });

  it("reports an unlimited corporate quota and a closed community one", async () => {
    await expect(loadMemberEventsContext(member, deps("corporate") as never)).resolves.toMatchObject({limit: Number.POSITIVE_INFINITY, canPublish: true});
    await expect(loadMemberEventsContext(member, deps("community") as never)).resolves.toMatchObject({limit: 0, canPublish: false});
  });

  it("saves a draft without a quota check and submits with one", async () => {
    const d = deps();
    await saveMemberEvent(member, "draft", input, {companyId: COMPANY}, d as never);
    expect(d.events.saveMemberDraft).toHaveBeenCalledWith(member, COMPANY, input, undefined, undefined);
    await saveMemberEvent(member, "submit", input, {companyId: COMPANY}, d as never);
    expect(d.events.submitMember).toHaveBeenCalledWith(member, COMPANY, input, undefined, undefined);
  });

  it("forwards the event id on the edit path so the write is an id-keyed update", async () => {
    const d = deps();
    await saveMemberEvent(member, "draft", input, {eventId: EVENT}, d as never);
    expect(d.events.saveMemberDraft).toHaveBeenCalledWith(member, COMPANY, input, undefined, EVENT);
    await saveMemberEvent(member, "submit", input, {eventId: EVENT}, d as never);
    expect(d.events.submitMember).toHaveBeenCalledWith(member, COMPANY, input, undefined, EVENT);
  });

  it("excludes the edited event from its own quota on re-submit, but not on a draft save", async () => {
    // Startup limit is 2; the count already includes the pending row being edited.
    const d = deps();
    d.events.countCompanySubmissionsThisQuarter.mockImplementation(async (_actor, _company, options) => (options?.excludeEventId === EVENT ? 1 : 2));
    await saveMemberEvent(member, "draft", input, {eventId: EVENT}, d as never);
    expect(d.events.countCompanySubmissionsThisQuarter).toHaveBeenLastCalledWith(member, COMPANY, undefined);
    await saveMemberEvent(member, "submit", input, {eventId: EVENT}, d as never);
    expect(d.events.countCompanySubmissionsThisQuarter).toHaveBeenLastCalledWith(member, COMPANY, {excludeEventId: EVENT});
    expect(d.events.submitMember).toHaveBeenCalledWith(member, COMPANY, input, undefined, EVENT);
    // A brand-new submission at the limit still refuses: nothing is excluded.
    d.events.submitMember.mockRejectedValueOnce(new Error("EVENT_QUOTA_EXCEEDED"));
    await expect(saveMemberEvent(member, "submit", input, {companyId: COMPANY}, d as never)).rejects.toThrow("EVENT_QUOTA_EXCEEDED");
    expect(d.events.countCompanySubmissionsThisQuarter).toHaveBeenLastCalledWith(member, COMPANY, undefined);
  });

  it("refuses when the member manages no company", async () => {
    const d = deps();
    d.dashboard.mockResolvedValueOnce({companies: [], memberships: []});
    await expect(loadMemberEventsContext(member, d as never)).rejects.toThrow("NO_MANAGED_COMPANY");
  });

  it("refuses when the managed company has no membership instead of borrowing another plan", async () => {
    const d = deps();
    d.dashboard.mockResolvedValueOnce({
      companies: [{id: COMPANY, canManage: true, displayName: "Acme"}],
      memberships: [{planCode: "corporate", status: "active", companyId: "33333333-3333-4333-8333-333333333333"}],
    });
    await expect(loadMemberEventsContext(member, d as never)).rejects.toThrow("NO_MEMBERSHIP_FOR_COMPANY");
    expect(d.events.countCompanySubmissionsThisQuarter).not.toHaveBeenCalled();
  });

  it.each(["pending_payment", "pending_review"])("does not grant event publishing to a %s membership", async (status) => {
    const d = deps("corporate");
    d.dashboard.mockResolvedValueOnce({
      companies: [{id: COMPANY, canManage: true, displayName: "Acme"}],
      memberships: [{planCode: "corporate", status, companyId: COMPANY}],
    });
    await expect(saveMemberEvent(member, "submit", input, {companyId: COMPANY}, d as never)).rejects.toThrow("NO_MEMBERSHIP_FOR_COMPANY");
    expect(d.events.submitMember).not.toHaveBeenCalled();
  });

  it("uses the active company plan instead of a pending upgrade", async () => {
    const d = deps("corporate");
    d.dashboard.mockResolvedValueOnce({
      companies: [{id: COMPANY, canManage: true, displayName: "Acme"}],
      memberships: [
        {planCode: "corporate", status: "pending_payment", companyId: COMPANY},
        {planCode: "startup", status: "active", companyId: COMPANY},
      ],
    });
    await saveMemberEvent(member, "submit", input, {companyId: COMPANY}, d as never);
    expect(d.events.submitMember).toHaveBeenCalledWith(member, COMPANY, input, undefined, undefined);
  });
  it("chooses an eligible managed company when the first company is pending", async () => {
    const otherCompany = "33333333-3333-4333-8333-333333333333";
    const d = deps();
    d.dashboard.mockResolvedValue({
      companies: [
        {id: COMPANY, canManage: true, displayName: "Pending"},
        {id: otherCompany, canManage: true, displayName: "Active"},
      ],
      memberships: [
        {planCode: "corporate", status: "pending_payment", companyId: COMPANY},
        {planCode: "startup", status: "active", companyId: otherCompany},
      ],
    });
    await expect(loadMemberEventsContext(member, d as never)).resolves.toMatchObject({companyId: otherCompany, plan: "startup"});
    await saveMemberEvent(member, "draft", input, {companyId: otherCompany}, d as never);
    expect(d.events.saveMemberDraft).toHaveBeenCalledWith(member, otherCompany, input, undefined, undefined);
  });
  it.each([
    {firstPlan: "community", firstUsed: 0},
    {firstPlan: "startup", firstUsed: 2},
  ])("chooses a publishable second company after a $firstPlan company with $firstUsed used slots", async ({firstPlan, firstUsed}) => {
    const otherCompany = "33333333-3333-4333-8333-333333333333";
    const d = deps();
    d.dashboard.mockResolvedValue({
      companies: [
        {id: COMPANY, canManage: true, displayName: "First"},
        {id: otherCompany, canManage: true, displayName: "Second"},
      ],
      memberships: [
        {planCode: firstPlan, status: "active", companyId: COMPANY},
        {planCode: "startup", status: "active", companyId: otherCompany},
      ],
    });
    d.events.countCompanySubmissionsThisQuarter.mockImplementation(async (_actor, company) => company === COMPANY ? firstUsed : 0);
    await expect(loadMemberEventsContext(member, d as never)).resolves.toMatchObject({companyId: otherCompany, canPublish: true});
  });
  it("prefers a full paid company over Community when neither can publish", async () => {
    const otherCompany = "33333333-3333-4333-8333-333333333333";
    const d = deps();
    d.dashboard.mockResolvedValue({
      companies: [
        {id: COMPANY, canManage: true, displayName: "Community"},
        {id: otherCompany, canManage: true, displayName: "Paid"},
      ],
      memberships: [
        {planCode: "community", status: "active", companyId: COMPANY},
        {planCode: "startup", status: "active", companyId: otherCompany},
      ],
    });
    d.events.countCompanySubmissionsThisQuarter.mockImplementation(async (_actor, company) => company === otherCompany ? 2 : 0);
    await expect(loadMemberEventsContext(member, d as never)).resolves.toMatchObject({companyId: otherCompany, limit: 2, canPublish: false});
  });
  it("keeps a rendered new event on its selected company when its last slot fills", async () => {
    const otherCompany = "33333333-3333-4333-8333-333333333333";
    const d = deps();
    d.dashboard.mockResolvedValue({
      companies: [
        {id: COMPANY, canManage: true, displayName: "Selected"},
        {id: otherCompany, canManage: true, displayName: "Other"},
      ],
      memberships: [
        {planCode: "startup", status: "active", companyId: COMPANY},
        {planCode: "startup", status: "active", companyId: otherCompany},
      ],
    });
    d.events.countCompanySubmissionsThisQuarter.mockImplementation(async (_actor, company) => company === COMPANY ? 2 : 0);
    await saveMemberEvent(member, "submit", input, {companyId: COMPANY}, d as never);
    expect(d.events.submitMember).toHaveBeenCalledWith(member, COMPANY, input, undefined, undefined);
    expect(d.events.countCompanySubmissionsThisQuarter).not.toHaveBeenCalledWith(member, otherCompany, undefined);
  });
  it("edits an event under its owning company when the member manages two", async () => {
    const otherCompany = "33333333-3333-4333-8333-333333333333";
    const d = deps();
    d.events.getForMemberEdit.mockResolvedValue({organiser_company_id: otherCompany});
    d.dashboard.mockResolvedValue({
      companies: [
        {id: COMPANY, canManage: true, displayName: "Acme"},
        {id: otherCompany, canManage: true, displayName: "Other"},
      ],
      memberships: [
        {planCode: "startup", status: "active", companyId: COMPANY},
        {planCode: "corporate", status: "active", companyId: otherCompany},
      ],
    });
    await saveMemberEvent(member, "draft", input, {eventId: EVENT}, d as never);
    expect(d.events.saveMemberDraft).toHaveBeenCalledWith(member, otherCompany, input, undefined, EVENT);
    await saveMemberEvent(member, "submit", input, {eventId: EVENT}, d as never);
    expect(d.events.countCompanySubmissionsThisQuarter).toHaveBeenLastCalledWith(member, otherCompany, {excludeEventId: EVENT});
    expect(d.events.submitMember).toHaveBeenCalledWith(member, otherCompany, input, undefined, EVENT);
  });

  it("never uses another managed company's plan for an edited event", async () => {
    const otherCompany = "33333333-3333-4333-8333-333333333333";
    const d = deps();
    d.events.getForMemberEdit.mockResolvedValue({organiser_company_id: otherCompany});
    await expect(saveMemberEvent(member, "submit", input, {eventId: EVENT}, d as never)).rejects.toThrow("FORBIDDEN");
    expect(d.events.submitMember).not.toHaveBeenCalled();
  });
  it("refuses a non-member actor before touching the dashboard", async () => {
    const d = deps();
    await expect(loadMemberEventsContext({kind: "staff", userId: "s", profileId: "p"}, d as never)).rejects.toThrow();
    expect(d.dashboard).not.toHaveBeenCalled();
  });

  it("lists events from every eligible managed company", async () => {
    const otherCompany = "33333333-3333-4333-8333-333333333333";
    const d = deps();
    d.dashboard.mockResolvedValue({
      companies: [
        {id: COMPANY, canManage: true, displayName: "Acme"},
        {id: otherCompany, canManage: true, displayName: "Other"},
      ],
      memberships: [
        {planCode: "startup", status: "active", companyId: COMPANY},
        {planCode: "startup", status: "active", companyId: otherCompany},
      ],
    });
    await listMyCompanyEvents(member, d as never);
    expect(d.events.listForCompany).toHaveBeenCalledWith(member, COMPANY);
    expect(d.events.listForCompany).toHaveBeenCalledWith(member, otherCompany);
  });
  it("lists the company's events alongside the context", async () => {
    const d = deps();
    const result = await listMyCompanyEvents(member, d as never);
    expect(d.events.listForCompany).toHaveBeenCalledWith(member, COMPANY);
    expect(result).toMatchObject({context: {companyId: COMPANY}, events: []});
  });
});
