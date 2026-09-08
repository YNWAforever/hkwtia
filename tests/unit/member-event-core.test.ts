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
      countCompanySubmissionsThisQuarter: vi.fn(async () => 1),
      listForCompany: vi.fn(async () => []),
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
    expect(d.events.countCompanySubmissionsThisQuarter).toHaveBeenCalledWith(member, COMPANY);
  });

  it("reports an unlimited corporate quota and a closed community one", async () => {
    await expect(loadMemberEventsContext(member, deps("corporate") as never)).resolves.toMatchObject({limit: Number.POSITIVE_INFINITY, canPublish: true});
    await expect(loadMemberEventsContext(member, deps("community") as never)).resolves.toMatchObject({limit: 0, canPublish: false});
  });

  it("saves a draft without a quota check and submits with one", async () => {
    const d = deps();
    await saveMemberEvent(member, "draft", input, {}, d as never);
    expect(d.events.saveMemberDraft).toHaveBeenCalledWith(member, COMPANY, input, undefined, undefined);
    await saveMemberEvent(member, "submit", input, {}, d as never);
    expect(d.events.submitMember).toHaveBeenCalledWith(member, COMPANY, input, {plan: "startup", usedThisQuarter: 1}, undefined);
  });

  it("forwards the event id on the edit path so the write is an id-keyed update", async () => {
    const d = deps();
    await saveMemberEvent(member, "draft", input, {eventId: EVENT}, d as never);
    expect(d.events.saveMemberDraft).toHaveBeenCalledWith(member, COMPANY, input, undefined, EVENT);
    await saveMemberEvent(member, "submit", input, {eventId: EVENT}, d as never);
    expect(d.events.submitMember).toHaveBeenCalledWith(member, COMPANY, input, {plan: "startup", usedThisQuarter: 1}, EVENT);
  });

  it("refuses when the member manages no company", async () => {
    const d = deps();
    d.dashboard.mockResolvedValueOnce({companies: [], memberships: []});
    await expect(saveMemberEvent(member, "draft", input, {}, d as never)).rejects.toThrow("NO_MANAGED_COMPANY");
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

  it("refuses a non-member actor before touching the dashboard", async () => {
    const d = deps();
    await expect(loadMemberEventsContext({kind: "staff", userId: "s", profileId: "p"}, d as never)).rejects.toThrow();
    expect(d.dashboard).not.toHaveBeenCalled();
  });

  it("lists the company's events alongside the context", async () => {
    const d = deps();
    const result = await listMyCompanyEvents(member, d as never);
    expect(d.events.listForCompany).toHaveBeenCalledWith(member, COMPANY);
    expect(result).toMatchObject({context: {companyId: COMPANY}, events: []});
  });
});
