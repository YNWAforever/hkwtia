import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({recent: vi.fn(async () => [{id: "11111111-1111-4111-8111-111111111111", operation: "profile_patch", state: "ready", createdAt: "2026-09-27T12:00:00.000Z", actorLabel: "Synthetic Staff", total: 3, succeeded: 0, skipped: 0, failed: 0}])}));
vi.mock("next-intl/server", () => ({getTranslations: vi.fn(async () => (key: string) => key), setRequestLocale: vi.fn()}));
vi.mock("next/link", () => ({default: ({children, href, ...props}: {children: React.ReactNode; href: string}) => <a href={href} {...props}>{children}</a>}));
vi.mock("@/lib/admin/page-auth", () => ({requireAdminPageActor: async () => ({kind: "staff", userId: "staff", profileId: "staff"})}));
vi.mock("@/lib/admin/approvals", () => ({listPendingApprovals: async () => []}));
vi.mock("@/lib/admin/at-risk", () => ({listAtRiskMembers: async () => []}));
vi.mock("@/lib/admin/inbox", () => ({listOpenTasks: async () => []}));
vi.mock("@/lib/db/repos/admin-posts", () => ({adminPostsRepository: {listForAdmin: async () => []}}));
vi.mock("@/lib/db/repos/company-profiles", () => ({companyProfilesRepository: {listForReview: async () => []}}));
vi.mock("@/lib/db/repos/showcase", () => ({showcaseRepository: {listForReview: async () => []}}));
vi.mock("@/lib/db/repos/admin-batch-history", () => ({adminBatchHistoryRepository: {recent: state.recent}}));

import AdminPage from "@/app/[locale]/(admin)/admin/page";

describe("admin dashboard recent batch recovery", () => {
  it("shows the actor's latest job with a direct recovery link", async () => {
    render(await AdminPage({params: Promise.resolve({locale: "en"})}));
    expect(screen.getByRole("heading", {name: "batches.history.recentTitle"})).toBeInTheDocument();
    expect(screen.getByRole("link", {name: "batches.history.open"})).toHaveAttribute("href", "/admin/batches/11111111-1111-4111-8111-111111111111");
    expect(state.recent).toHaveBeenCalledTimes(1);
  });
});
