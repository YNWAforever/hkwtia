import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {z} from "zod";

const reads = vi.hoisted(() => ({summary: vi.fn(), full: vi.fn(), timeline: vi.fn(), editable: vi.fn()}));
vi.mock("next-intl/server", () => ({setRequestLocale: () => undefined, getTranslations: async () => (key: string) => key}));
vi.mock("next/navigation", () => ({notFound: () => {throw new Error("NEXT_NOT_FOUND");}}));
vi.mock("@/lib/admin/page-auth", () => ({requireAdminPageActor: async () => ({kind: "staff", userId: "staff", profileId: "staff"})}));
vi.mock("@/lib/admin/member-360", () => ({getMember360: reads.full, Member360NotFoundError: class extends Error {}}));
vi.mock("@/lib/db/repos/admin-members", () => ({adminMembersRepository: {getSummary: reads.summary, getMemberTimelinePage: reads.timeline}, memberTimelineKindSchema: z.enum(["engagement", "emails", "events", "purchases", "notes", "journeys", "whatsapp", "suppressions"])}));
vi.mock("@/lib/db/repos/admin-member-profile", () => ({getEditableMemberProfile: reads.editable}));
vi.mock("@/lib/admin/member-note-actions", () => ({appendMemberNoteAction: vi.fn()}));
vi.mock("@/lib/admin/member-profile-actions", () => ({updateMemberProfileAction: vi.fn()}));
vi.mock("@/lib/admin/membership-comp-actions", () => ({compMembershipAction: vi.fn()}));
vi.mock("@/components/admin/member-note-form", () => ({MemberNoteForm: () => null}));
vi.mock("@/components/admin/member-profile-form", () => ({MemberProfileForm: () => null}));
vi.mock("@/components/admin/membership-comp-form", () => ({MembershipCompForm: () => null}));
vi.mock("@/components/admin/member-360", () => ({Member360View: ({activeHistory}: {activeHistory?: string | null}) => <div data-active={activeHistory ?? "summary"}/>}));

import AdminMember360Page from "@/app/[locale]/(admin)/admin/members/[id]/page";

const id = "member-1";
const summary = {profile: {id, displayName: "Member", email: "m@example.test", phone: null, role: "member"}, companies: [], membership: null, memberships: [], engagement: {score: 5, trend: 0, events: []}, emails: [], events: [], purchases: [], notes: [], journeys: [], whatsapp: [], suppressions: []};

beforeEach(() => {
  vi.clearAllMocks();
  reads.summary.mockResolvedValue(summary);
  reads.full.mockResolvedValue(summary);
  reads.timeline.mockResolvedValue({kind: "notes", page: {items: [{id: "note-1", body: "Follow up", authorProfileId: "staff", authorName: "Staff", replacesNoteId: null, createdAt: "2026-09-27T00:00:00Z"}], nextCursor: null}});
  reads.editable.mockResolvedValue(null);
});

async function markup(section?: string) {
  return renderToStaticMarkup(await AdminMember360Page({params: Promise.resolve({locale: "en", id}), searchParams: Promise.resolve(section ? {section} : {})}));
}

describe("Member 360 page lazy histories", () => {
  it("loads summary without the legacy full detail or any history", async () => {
    expect(await markup()).toContain('data-active="summary"');
    expect(reads.summary).toHaveBeenCalledOnce();
    expect(reads.full).not.toHaveBeenCalled();
    expect(reads.timeline).not.toHaveBeenCalled();
  });

  it("loads only the chosen history after an explicit section navigation", async () => {
    expect(await markup("notes")).toContain('data-active="notes"');
    expect(reads.summary).toHaveBeenCalledOnce();
    expect(reads.timeline).toHaveBeenCalledWith(expect.anything(), id, "notes", expect.objectContaining({limit: 20}));
    expect(reads.full).not.toHaveBeenCalled();
  });
});
