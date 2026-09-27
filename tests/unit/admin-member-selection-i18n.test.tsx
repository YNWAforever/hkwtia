import {fireEvent, render, screen} from "@testing-library/react";
import {createTranslator} from "next-intl";
import {beforeEach, describe, expect, it, vi} from "vitest";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

vi.mock("next-intl/server", () => ({setRequestLocale: () => undefined, getTranslations: async ({locale}: {locale: string}) => createTranslator({locale, messages: locale === "zh-HK" ? zh : en, namespace: "Admin", onError: (error) => {throw error;}})}));
vi.mock("next/navigation", () => ({useRouter: () => ({push: vi.fn()})}));
vi.mock("@/lib/admin/page-auth", () => ({requireAdminPageActor: async () => ({kind: "staff", userId: "staff", profileId: "staff"})}));
vi.mock("@/lib/db/repos/admin-members", () => ({adminMembersRepository: {listOperationOwners: async () => []}}));
vi.mock("@/lib/admin/member-views", () => ({listMemberViews: async () => []}));
vi.mock("@/lib/db/repos/admin-member-views", () => ({adminMemberViewsRepository: {}}));
vi.mock("@/components/admin/member-saved-views", () => ({MemberSavedViews: () => null}));
vi.mock("@/lib/admin/batches/actions", () => ({prepareAdminBatchAction: vi.fn()}));
vi.mock("@/lib/admin/members", () => ({searchAdminMembers: async () => ({items: [{profileId: "synthetic-a", membershipId: "membership-a", companyId: null, displayName: "Ada", email: "ada@example.test", companyName: null, planCode: "community", membershipStatus: "active", renewalAt: null, score: null, matchingMembershipIds: ["membership-a"]}], totalMatching: 10, nextCursor: null})}));

import AdminMembersPage from "@/app/[locale]/(admin)/admin/members/page";

beforeEach(() => sessionStorage.clear());
describe("member page selection labels with the real ICU translator", () => {
  it.each([["en", en], ["zh-HK", zh]] as const)("%s carries dynamic templates to the client without a missing-value error", async (locale, messages) => {
    render(await AdminMembersPage({params: Promise.resolve({locale}), searchParams: Promise.resolve({q: "Ada"})}));
    const labels = messages.Admin.members.selection;
    fireEvent.click(screen.getByRole("checkbox", {name: labels.row.replace("{name}", "Ada"), exact: true}));
    expect(screen.getByRole("status")).toHaveTextContent(labels.selected.replace("{count}", "1"));
    fireEvent.click(screen.getByRole("button", {name: labels.all.replace("{count}", "10"), exact: true}));
    expect(screen.getByRole("status")).toHaveTextContent(labels.selected.replace("{count}", "10"));
  });
});
