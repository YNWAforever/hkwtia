import {render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({fail: false, list: vi.fn(async () => ({items: [{id: "11111111-1111-4111-8111-111111111111", operation: "profile_patch", state: "completed_with_errors", createdAt: "2026-09-27T12:00:00.000Z", actorLabel: "Synthetic Staff", total: 10, succeeded: 8, skipped: 0, failed: 2}], nextCursor: null}))}));
vi.mock("next-intl/server", () => ({getTranslations: vi.fn(async () => (key: string) => key), setRequestLocale: vi.fn()}));
vi.mock("next/navigation", () => ({notFound: () => {throw new Error("NEXT_NOT_FOUND");}}));
vi.mock("next/link", () => ({default: ({children, href, ...props}: {children: React.ReactNode; href: string}) => <a href={href} {...props}>{children}</a>}));
vi.mock("@/lib/admin/page-auth", () => ({requireAdminPageActor: vi.fn(async () => ({kind: "staff", userId: "staff", profileId: "staff"}))}));
vi.mock("@/lib/db/repos/admin-batch-history", () => ({adminBatchHistoryRepository: {list: async () => {if (state.fail) throw new Error("DB_UNAVAILABLE"); return state.list();}}}));

import AdminBatchesPage from "@/app/[locale]/(admin)/admin/batches/page";
const props = (query: Record<string, string> = {}) => ({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve(query)});

describe("batch operation centre", () => {
  beforeEach(() => {state.fail = false; state.list.mockClear();});
  it("shows actor-scoped recent jobs and a path back to the partial job", async () => {
    render(await AdminBatchesPage(props()));
    expect(screen.getByRole("heading", {name: "history.title"})).toBeInTheDocument();
    expect(screen.getByRole("link", {name: "history.open"})).toHaveAttribute("href", "/admin/batches/11111111-1111-4111-8111-111111111111");
    expect(screen.getByText("Synthetic Staff").closest("tr")).toHaveTextContent("8 / 10");
    expect(state.list).toHaveBeenCalledTimes(1);
  });
  it("distinguishes a failed history read from an empty list", async () => {
    state.fail = true;
    render(await AdminBatchesPage(props()));
    expect(screen.getByRole("alert")).toHaveTextContent("history.unavailable");
    expect(screen.queryByText("history.empty")).not.toBeInTheDocument();
  });
});
