import {createTranslator} from "next-intl";
import en from "@/messages/en.json";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

const calls = vi.hoisted(() => ({actor: vi.fn(), members: vi.fn(), views: vi.fn()}));
vi.mock("next-intl/server", () => ({setRequestLocale: () => undefined, getTranslations: async () => createTranslator({locale: "en", messages: en, namespace: "Admin", onError: (error) => {throw error;}})}));
vi.mock("@/lib/admin/page-auth", () => ({requireAdminPageActor: calls.actor}));
vi.mock("@/lib/admin/members", () => ({searchAdminMembers: calls.members}));
vi.mock("@/lib/admin/member-views", () => ({listMemberViews: calls.views}));
vi.mock("@/lib/db/repos/admin-member-views", () => ({adminMemberViewsRepository: {}}));
vi.mock("@/components/admin/member-table", () => ({MemberTable: () => <div data-member-table="true"/>}));
vi.mock("@/components/admin/member-saved-views", () => ({MemberSavedViews: () => <div data-saved-views="true"/>}));

import AdminMembersPage from "@/app/[locale]/(admin)/admin/members/page";

describe("admin member workspace page", () => {
  it("reads saved views after the actor boundary and displays them with the filtered member list", async () => {
    const actor = {kind: "staff", userId: "staff", profileId: "staff"};
    calls.actor.mockResolvedValue(actor);
    calls.members.mockResolvedValue({items: [], nextCursor: null, totalMatching: 0});
    calls.views.mockResolvedValue([]);
    const html = renderToStaticMarkup(await AdminMembersPage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({status: "active"})}));
    expect(calls.views).toHaveBeenCalledWith(actor, expect.anything());
    expect(html).toContain('data-saved-views="true"');
    expect(html).toContain('data-member-table="true"');
  });
});
