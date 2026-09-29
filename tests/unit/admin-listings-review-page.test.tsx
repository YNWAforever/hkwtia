import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({list: vi.fn(async () => ({items: [], nextCursor: "next-safe"})), media: vi.fn(async () => [])}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn(async () => Object.assign((key: string) => key, {raw: (key: string) => key})),
}));
vi.mock("@/lib/admin/page-auth", () => ({requireAdminPageActor: async () => ({kind: "staff", userId: "staff", profileId: "staff"})}));
vi.mock("@/lib/db/repos/showcase", () => ({showcaseRepository: {listForReview: state.list}}));
vi.mock("@/lib/db/repos/media", () => ({mediaRepository: {listActiveForAdmin: state.media}}));
vi.mock("@/components/admin/showcase-review-table", () => ({ShowcaseReviewTable: () => <div data-testid="review-table"/>}));
vi.mock("next/navigation", () => ({notFound: () => {throw new Error("NEXT_NOT_FOUND");}}));

import AdminListingsReviewPage from "@/app/[locale]/(admin)/admin/listings-review/page";

describe("admin showcase review queue", () => {
  beforeEach(() => {state.list.mockClear(); state.media.mockClear();});

  it("shows the pending-only view when opened from the dashboard count", async () => {
    const html = renderToStaticMarkup(await AdminListingsReviewPage({
      params: Promise.resolve({locale: "en"}),
      searchParams: Promise.resolve({status: "pending_review"}),
    }));
    expect(state.list).toHaveBeenCalledWith(expect.objectContaining({kind: "staff"}), "pending_review", undefined);
    expect(html).toContain('href="/admin/listings-review?status=pending_review&amp;cursor=next-safe"');
    expect(html).toContain('href="/admin/listings-review"');
  });

  it("rejects an unsupported review filter instead of widening the queue", async () => {
    await expect(AdminListingsReviewPage({
      params: Promise.resolve({locale: "en"}),
      searchParams: Promise.resolve({status: "published"}),
    })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(state.list).not.toHaveBeenCalled();
  });
  it("passes a scoped cursor and rejects ambiguous or unrelated query keys", async () => {
    await AdminListingsReviewPage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({status: "pending_review", cursor: "cursor-safe"})});
    expect(state.list).toHaveBeenCalledWith(expect.objectContaining({kind: "staff"}), "pending_review", "cursor-safe");
    state.list.mockClear();
    await expect(AdminListingsReviewPage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({cursor: ["one", "two"]})})).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(AdminListingsReviewPage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({other: "unexpected"})})).rejects.toThrow("NEXT_NOT_FOUND");
    expect(state.list).not.toHaveBeenCalled();
  });
  it("retains the all-status management view for existing links", async () => {
    await AdminListingsReviewPage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({})});
    expect(state.list).toHaveBeenCalledWith(expect.objectContaining({kind: "staff"}), undefined, undefined);
  });
});