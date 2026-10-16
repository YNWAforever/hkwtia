import {render, screen, within} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({recent: vi.fn(async () => [{id: "11111111-1111-4111-8111-111111111111", operation: "profile_patch", state: "completed_with_errors", createdAt: "2026-09-27T12:00:00.000Z", actorLabel: "Synthetic Staff", total: 3, succeeded: 1, skipped: 0, failed: 1}])}));
vi.mock("next-intl/server", () => ({getTranslations: vi.fn(async () => (key: string, values?: {count?: number}) => key === "batches.history.recentFailed" ? `Failed: ${values?.count}` : key), setRequestLocale: vi.fn()}));
vi.mock("next/link", () => ({default: ({children, href, ...props}: {children: React.ReactNode; href: string}) => <a href={href} {...props}>{children}</a>}));
vi.mock("@/lib/admin/page-auth", () => ({requireAdminPageActor: async () => ({kind: "staff", userId: "staff", profileId: "staff"})}));
vi.mock("@/lib/db/repos/admin-dashboard", () => ({adminDashboardRepository: {counts: async () => ({approvals: 0, atRisk: 0, listings: 0, profiles: 0, openTasks: 0, draftNews: 0,unfinishedApplications:0,submittedApplications:0,profileRecords:0,activeMemberships:0,companySeats:0})}}));
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
    expect(screen.getByText("dashboard.snapshotAt")).toBeInTheDocument();
    expect(screen.getByRole("link", {name: "batches.history.open"})).toHaveAttribute("href", "/admin/batches/11111111-1111-4111-8111-111111111111");
    expect(screen.getByRole("link", {name: /dashboard.listingsAwaitingReview/})).toHaveAttribute("href", "/admin/listings-review?status=pending_review");
    expect(state.recent).toHaveBeenCalledTimes(1);
  });

  it("puts review queues first and links directly to application progress", async () => {
    render(await AdminPage({params: Promise.resolve({locale: "en"})}));

    const queues = screen.getByRole("region", {name: "dashboard.heading"});
    expect(within(queues).getAllByRole("link").map(link => link.getAttribute("href"))).toEqual([
      "/admin/members/queue?status=draft",
      "/admin/members/queue",
      "/admin/profiles-review",
      "/admin/listings-review?status=pending_review",
      "/admin/approvals",
      "/admin/tasks",
      "/admin/at-risk",
      "/admin/news",
      "/admin/members/queue",
    ]);
    expect(screen.getByRole("link", {name: "dashboard.applicationQueue"})).toHaveAttribute("href", "/admin/members/queue");
  });

  it("shows the batch time and failed item count for follow-up", async () => {
    const {container} = render(await AdminPage({params: Promise.resolve({locale: "en"})}));

    expect(container.querySelector('time[dateTime="2026-09-27T12:00:00.000Z"]')).not.toBeNull();
    expect(screen.getByRole("link", {name: "batches.history.open"}).closest("li")).toHaveTextContent("Failed: 1");
  });
});
