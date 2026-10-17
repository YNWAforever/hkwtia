import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({
  listForAdmin: vi.fn(),
  listForReview: vi.fn(),
  media: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async () => Object.assign(
    (key: string) => key,
    {raw: (key: string) => key},
  ),
}));
vi.mock("@/lib/admin/page-auth", () => ({
  requireAdminPageActor: async () => ({
    kind: "staff",
    userId: "staff",
    profileId: "staff",
  }),
}));
vi.mock("@/lib/db/repos/events", () => ({
  eventsRepository: {
    listForAdmin: reads.listForAdmin,
    listForReview: reads.listForReview,
  },
}));
vi.mock("@/lib/db/repos/media", () => ({
  mediaRepository: {listActiveForAdmin: reads.media},
}));
vi.mock("@/components/admin/event-form", () => ({
  EventForm: () => <div data-form="event"/>,
}));
vi.mock("@/components/admin/event-review-table", () => ({
  EventReviewTable: () => <div data-table="review"/>,
}));
vi.mock("@/lib/admin/event-actions", () => ({
  createEventAction: vi.fn(),
}));
vi.mock("@/lib/admin/event-review-actions", () => ({
  approveMemberEventAction: vi.fn(),
  rejectMemberEventAction: vi.fn(),
}));

import AdminEventsPage from "@/app/[locale]/(admin)/admin/events-mgmt/page";

const matching = "11111111-1111-4111-8111-111111111111";
const hidden = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  reads.listForAdmin.mockResolvedValue([
    {
      id: matching,
      titleEn: "Synthetic Target Event",
      titleZh: "合成目標活動",
      slug: "synthetic-target",
    },
    {
      id: hidden,
      titleEn: "Unrelated Event",
      titleZh: "無關活動",
      slug: "unrelated",
    },
  ]);
  reads.listForReview.mockResolvedValue([]);
  reads.media.mockResolvedValue([]);
});

describe("admin event finder", () => {
  it("filters the event list and links directly to its attendee tab", async () => {
    const page = await AdminEventsPage({
      params: Promise.resolve({locale: "en"}),
      searchParams: Promise.resolve({q: "target"}),
    } as never);
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Synthetic Target Event");
    expect(html).not.toContain("Unrelated Event");
    expect(html).toContain(
      `/admin/events-mgmt/${matching}?tab=attendees`,
    );
  });
});
