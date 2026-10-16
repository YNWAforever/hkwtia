import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { it, expect, vi, beforeEach } from "vitest";
import { EventForm } from "@/components/admin/event-form";
import { NewsForm } from "@/components/admin/news-form";
import { adoptContentDraftAction } from "@/lib/admin/content-draft-actions";
import type { AiDraftDetails } from "@/lib/db/repos/ai-drafts";
vi.mock("@/lib/admin/content-draft-actions", () => ({
  prepareContentDraftAction: vi.fn(),
  adoptContentDraftAction: vi.fn(),
}));
beforeEach(() => vi.clearAllMocks());
import en from "@/messages/en.json";
it("offers private staff content drafting beside the existing event preview and save", () => {
  const assistance = {
    kind: "event" as const,
    id: "11111111-1111-4111-8111-111111111111",
    locale: "en" as const,
    labels: en.ContentAssistance,
    configured: false,
    enabled: false,
    drafts: { en: null, "zh-HK": null },
  };
  render(
    <EventForm
      action={vi.fn()}
      labels={en.Admin.eventsMgmt}
      assistance={assistance}
    />,
  );
  screen.getByRole("heading", { name: "Content drafting" });
  screen.getByRole("button", { name: en.Admin.eventsMgmt.previewDraft });
});

const approved: AiDraftDetails = {
  draft: {
    id: "22222222-2222-4222-8222-222222222222",
    version: 2,
    state: "approved",
    kind: "content",
    caseId: "event:11111111-1111-4111-8111-111111111111:en",
    factsHash: "a".repeat(64),
    ownerId: null,
    dueAt: null,
    body: "Review source records.",
    claims: [],
    sourceRefs: [],
    modelRoute: "synthetic-ui-provider",
    promptVersion: "ui-only",
    runId: "33333333-3333-4333-8333-333333333333",
  },
  factsAvailable: true,
  violations: [],
  renderedBody: "Review source records.",
  previousBody: null,
  facts: {
    caseId: "event:11111111-1111-4111-8111-111111111111:en",
    locale: "en",
    versionHash: "a".repeat(64),
    asOf: "2026-10-01T00:00:00Z",
    values: {},
    sourceRefs: [],
    recordSources: {},
    sourceUrls: {},
    displayLabels: { yes: "Yes", no: "No", notAvailable: "Unavailable" },
    comparisonAvailable: false,
  },
  costMicrousd: null,
  usageState: "not_dispatched",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};
function assistance(kind: "event" | "news") {
  return {
    kind,
    id: "11111111-1111-4111-8111-111111111111",
    locale: "en" as const,
    labels: en.ContentAssistance,
    configured: false,
    enabled: true,
    drafts: { en: approved, "zh-HK": null },
  };
}
it("copies only event description text and preserves price, capacity, registration, time, titles and publication", async () => {
  vi.mocked(adoptContentDraftAction).mockResolvedValue({
    status: "adopted",
    body: "Reviewed copy.",
    locale: "en",
  });
  const { container } = render(
    <EventForm
      action={vi.fn()}
      labels={en.Admin.eventsMgmt}
      values={{
        titleEn: "Source event",
        titleZh: "來源活動",
        descriptionEn: "Existing copy.",
        descriptionZh: "原有正文。",
        startsAt: new Date("2026-10-31T16:30:00Z"),
        venue: "Synthetic Hall",
        capacity: 50,
        registrationMode: "ticketed",
        ticketPriceHkdCents: 10000,
        published: false,
      }}
      assistance={assistance("event")}
    />,
  );
  const form = container.querySelector("form")!;
  const before = new FormData(form);
  fireEvent.click(
    screen.getByRole("button", { name: en.ContentAssistance.adopt }),
  );
  await waitFor(() =>
    expect(form.elements.namedItem("descriptionEn")).toHaveValue(
      "Reviewed copy.",
    ),
  );
  const after = new FormData(form);
  for (const key of [
    "titleEn",
    "titleZh",
    "descriptionZh",
    "startsAt",
    "endsAt",
    "venue",
    "capacity",
    "registrationMode",
    "ticketPriceHkdCents",
    "published",
  ])
    expect(after.get(key)).toEqual(before.get(key));
  expect(
    screen.getByRole("button", { name: en.Admin.eventsMgmt.previewDraft }),
  ).toBeEnabled();
  expect(
    screen.getByRole("button", { name: en.Admin.eventsMgmt.saveDraft }),
  ).toBeEnabled();
});
it("keeps manually edited copy and disables adoption while it is unsaved", () => {
  render(
    <EventForm
      action={vi.fn()}
      labels={en.Admin.eventsMgmt}
      values={{ descriptionEn: "Existing copy." }}
      assistance={assistance("event")}
    />,
  );
  fireEvent.input(screen.getByLabelText(en.Admin.eventsMgmt.descriptionEn), {
    target: { value: "My unsaved copy." },
  });
  expect(
    screen.getByRole("button", { name: en.ContentAssistance.adopt }),
  ).toBeDisabled();
  expect(screen.getByLabelText(en.Admin.eventsMgmt.descriptionEn)).toHaveValue(
    "My unsaved copy.",
  );
  expect(adoptContentDraftAction).not.toHaveBeenCalled();
});
it("copies only the selected news body without publishing or replacing either title", async () => {
  vi.mocked(adoptContentDraftAction).mockResolvedValue({
    status: "adopted",
    body: "Reviewed news.",
    locale: "en",
  });
  render(
    <NewsForm
      action={vi.fn()}
      labels={en.Admin.news}
      values={{
        titleEn: "Source title",
        titleZh: "來源標題",
        bodyMdx: "Original.",
        bodyMdxZhHk: "原有正文。",
        publishedAt: null,
      }}
      assistance={assistance("news")}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: en.ContentAssistance.adopt }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("textbox", { name: /Body \(English\)/ }),
    ).toHaveValue("Reviewed news."),
  );
  expect(screen.getByLabelText(en.Admin.news.titleEn)).toHaveValue(
    "Source title",
  );
  expect(screen.getByLabelText(en.Admin.news.titleZh)).toHaveValue("來源標題");
  expect(
    screen.getByRole("textbox", { name: /Body \(Traditional Chinese/ }),
  ).toHaveValue("原有正文。");
  expect(
    screen.getByRole("checkbox", { name: en.Admin.news.published }),
  ).not.toBeChecked();
});

it("does not overwrite an edit made while approved text is loading", async () => {
  let resolve!: (
    value: Awaited<ReturnType<typeof adoptContentDraftAction>>,
  ) => void;
  vi.mocked(adoptContentDraftAction).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  render(
    <EventForm
      action={vi.fn()}
      labels={en.Admin.eventsMgmt}
      values={{ descriptionEn: "Original." }}
      assistance={assistance("event")}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: en.ContentAssistance.adopt }),
  );
  await waitFor(() => expect(adoptContentDraftAction).toHaveBeenCalled());
  fireEvent.input(screen.getByLabelText(en.Admin.eventsMgmt.descriptionEn), {
    target: { value: "My newer edit." },
  });
  await act(async () => {
    resolve({
      status: "adopted",
      body: "Delayed approved copy.",
      locale: "en",
    });
  });
  expect(screen.getByLabelText(en.Admin.eventsMgmt.descriptionEn)).toHaveValue(
    "My newer edit.",
  );
  expect(screen.getByText(en.ContentAssistance.dirty)).toBeInTheDocument();
});
