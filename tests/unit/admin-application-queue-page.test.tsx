import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({page: vi.fn()}));
vi.mock("@/lib/db/repos/admin-members", async (original) => ({
  ...(await original<typeof import("@/lib/db/repos/admin-members")>()),
  adminMembersRepository: {getApplicationQueuePage: reads.page},
}));
vi.mock("@/lib/admin/page-auth", () => ({
  requireAdminPageActor: async () => ({
    kind: "staff",
    userId: "staff",
    profileId: "staff",
  }),
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async () =>
    Object.assign(
      (key: string, values?: {count?: number}) =>
        values?.count === undefined ? key : `${key}:${values.count}`,
      {raw: (key: string) => key},
    ),
}));

import AdminApplicationQueuePage from "@/app/[locale]/(admin)/admin/members/queue/page";

beforeEach(() => {
  vi.clearAllMocks();
  reads.page.mockResolvedValue({
    items: [],
    nextCursor: null,
    totalMatching: 2,
    counts: {draft: 1, pending_payment: 4, pending_review: 2},
  });
});

describe("admin application queue controls", () => {
  it("keeps count, sort and page size tied to the validated filter", async () => {
    const page = await AdminApplicationQueuePage({
      params: Promise.resolve({locale: "en"}),
      searchParams: Promise.resolve({
        status: "pending_review",
        q: "Synthetic",
        sort: "updated_asc",
        limit: "10",
      }),
    });
    const html = renderToStaticMarkup(page);

    expect(reads.page).toHaveBeenCalledWith(
      expect.objectContaining({kind: "staff"}),
      {
        status: "pending_review",
        search: "Synthetic",
        sort: "updated_asc",
        limit: 10,
        cursor: null,
      },
    );
    expect(html).toContain("applicationQueue.viewsLabels.pending_review (2)");
    expect(html).toContain("applicationQueue.totalMatching:2");
    expect(html).toMatch(/name="sort"[^>]*>.*value="updated_asc" selected=""/);
    expect(html).toMatch(/name="limit"[^>]*>.*value="10" selected=""/);
  });
});
