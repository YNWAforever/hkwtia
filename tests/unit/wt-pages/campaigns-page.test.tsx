import {render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {CampaignRecord, CampaignReport} from "@/lib/admin/campaigns";
import en from "@/messages/en.json";

/**
 * Phase C2 Task 9. The two things `/admin/campaigns` has to get right on screen.
 *
 * The preview is the first one: its counts are what a second admin approves, and
 * before this phase the "suppressed" category was a dead flag that had read
 * constant `false` since M2. A preview that renders no category table is
 * indistinguishable from one where nobody is blocked.
 *
 * The second is S-7. `reviewableCampaign` is the authorization — the repository
 * refuses an approval by the creator whatever the screen shows — but a control
 * that is rendered and then refuses is a 500 on a button that could never have
 * worked, and the reader is left unable to tell a rule from a bug. So the
 * creator is offered no approve control at all, and is told why.
 */
const creatorProfileId = "22222222-2222-4222-8222-222222222222";
const reviewerProfileId = "44444444-4444-4444-8444-444444444444";
const campaignId = "33333333-3333-4333-8333-333333333333";
const segmentId = "55555555-5555-4555-8555-555555555555";
const draftId = "11111111-1111-4111-8111-111111111111";

const state = vi.hoisted(() => ({
  actorProfileId: "",
  preview: vi.fn(),
  listCampaigns: vi.fn(),
  readCampaign: vi.fn(),
  templates: vi.fn(),
  segments: vi.fn(),
}));

/**
 * Resolves against the real bundle rather than echoing the key, so a key a page
 * asks for and neither bundle carries fails here as well as in `audit:strings`.
 */
function translator(namespace: "campaigns" | "segments") {
  return (key: string, values: Readonly<Record<string, string>> = {}): string => {
    const found = key.split(".").reduce<unknown>(
      (node, part) => (typeof node === "object" && node !== null ? (node as Record<string, unknown>)[part] : undefined),
      en.Admin[namespace],
    );
    if (typeof found !== "string") throw new Error(`missing Admin.${namespace}.${key}`);
    return found.replaceAll(/\{(\w+)\}/g, (_match, name: string) => values[name] ?? "");
  };
}

vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async ({namespace}: {namespace: string}) => translator(namespace === "Admin.segments" ? "segments" : "campaigns"),
}));
vi.mock("next/navigation", () => ({
  notFound: (): never => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (path: string): never => { throw new Error(`NEXT_REDIRECT:${path}`); },
}));
vi.mock("@/lib/admin/page-auth", () => ({
  requireAdminPageActor: async () => ({kind: "staff", userId: "staff-user", profileId: state.actorProfileId}),
}));
// The `"use server"` module: mocked so the pages under test bind plain
// functions rather than reaching for a session and a database.
vi.mock("@/lib/admin/campaign-review-actions", () => ({
  approveCampaignAction: vi.fn(),
  createCampaignDraftAction: vi.fn(),
  rejectCampaignAction: vi.fn(),
  submitCampaignForReviewAction: vi.fn(),
}));
vi.mock("@/lib/db/repos/whatsapp-templates", () => ({
  whatsappTemplatesRepository: {list: (...args: readonly unknown[]) => state.templates(...args)},
}));
vi.mock("@/lib/db/repos/segments", () => ({
  segmentsRepository: {list: (...args: readonly unknown[]) => state.segments(...args)},
}));
vi.mock("@/lib/admin/campaigns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/campaigns")>()),
  listCampaigns: (...args: readonly unknown[]) => state.listCampaigns(...args),
  readCampaign: (...args: readonly unknown[]) => state.readCampaign(...args),
}));
vi.mock("@/lib/admin/campaign-wizard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/campaign-wizard")>()),
  previewCampaignAudience: (...args: readonly unknown[]) => state.preview(...args),
}));

// Imported after the vi.mock calls above, so the mocked modules are in place
// before either page's module graph is evaluated.
import AdminCampaignDetailPage from "@/app/[locale]/(admin)/admin/campaigns/[id]/page";
import AdminCampaignsPage from "@/app/[locale]/(admin)/admin/campaigns/page";

const approvedTemplate = {
  key: "wtia_announcement_en",
  elementName: "wtia_announcement_en",
  languageCode: "en_US",
  category: "marketing" as const,
  variables: ["memberName", "headline", "detailUrl"],
  previews: {},
  status: "approved" as const,
  approvedAt: new Date("2026-09-01T00:00:00.000Z"),
  reviewedByProfileId: null,
  rejectionReason: null,
};

function campaign(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id: campaignId,
    name: "September announcement",
    channel: "whatsapp",
    template: null,
    templateKey: "wtia_announcement_en",
    variablesTemplate: {},
    status: "review",
    segmentId,
    createdByProfileId: creatorProfileId,
    scheduledAt: null,
    reviewedAt: null,
    reviewedByProfileId: null,
    rejectionReason: null,
    completedAt: null,
    createdAt: new Date("2026-09-10T00:00:00.000Z"),
    ...overrides,
  };
}

const report: CampaignReport = {
  total: 20, queued: 0, sent: 18, delivered: 17, read: 5, failed: 0, blocked: 2,
  byReason: {not_opted_in: 2},
};

describe("the campaign wizard page", () => {
  beforeEach(() => {
    state.actorProfileId = creatorProfileId;
    state.preview.mockReset();
    state.listCampaigns.mockReset().mockResolvedValue([]);
    state.templates.mockReset().mockResolvedValue([approvedTemplate]);
    state.segments.mockReset().mockResolvedValue([{id: segmentId, ownerProfileId: creatorProfileId, nameEn: "Opted-in members", nameZh: null, filterVersion: 2, filters: {}, createdAt: "", updatedAt: ""}]);
  });

  it("renders the eligibility table on the preview step, category by category", async () => {
    state.preview.mockResolvedValue({eligible: 18, blocked: 2, byReason: {not_opted_in: 1, missing_variable: 1}});

    render(await AdminCampaignsPage({
      params: Promise.resolve({locale: "en"}),
      searchParams: Promise.resolve({
        campaignDraft: draftId,
        step: "preview",
        name: "September announcement",
        channel: "whatsapp",
        templateKey: "wtia_announcement_en",
        segmentId,
        var_memberName: "{{displayName}}",
        var_headline: "Trade week",
        var_detailUrl: "https://hkwtia.org/news",
      }),
    }));

    expect(screen.getByText(en.Admin.campaigns.eligibility.eligible)).toBeInTheDocument();
    // `missing_variable` is not an eligibility category — it is a template fact —
    // but it has to be visible BEFORE the blast rather than as one permanent
    // failure and one staff task per recipient afterwards.
    expect(screen.getByText(en.Admin.campaigns.eligibility.missing_variable)).toBeInTheDocument();
    expect(screen.getByText(en.Admin.campaigns.eligibility.suppressed)).toBeInTheDocument();
    expect(screen.getByRole("button", {name: en.Admin.campaigns.actions.createDraft})).toBeInTheDocument();
  });

  it("refuses to offer Create draft while an answer is still missing", async () => {
    render(await AdminCampaignsPage({
      params: Promise.resolve({locale: "en"}),
      searchParams: Promise.resolve({campaignDraft: draftId, step: "preview", name: "September announcement", channel: "whatsapp"}),
    }));

    expect(screen.queryByRole("button", {name: en.Admin.campaigns.actions.createDraft})).toBeNull();
    expect(screen.getByText(en.Admin.campaigns.variables.missing)).toBeInTheDocument();
    // And no audience read was attempted: a preview of half a campaign counts
    // the wrong people.
    expect(state.preview).not.toHaveBeenCalled();
  });

  it("says so when the registry has approved no template, rather than offering an empty select", async () => {
    state.templates.mockResolvedValue([{...approvedTemplate, status: "pending", approvedAt: null}]);

    render(await AdminCampaignsPage({
      params: Promise.resolve({locale: "en"}),
      searchParams: Promise.resolve({campaignDraft: draftId, step: "template", channel: "whatsapp", name: "September announcement"}),
    }));

    expect(screen.getByText(en.Admin.campaigns.templateUnapproved)).toBeInTheDocument();
  });

  it("renders the error state rather than an empty list when a read fails", async () => {
    state.listCampaigns.mockRejectedValue(new Error("down"));

    render(await AdminCampaignsPage({
      params: Promise.resolve({locale: "en"}),
      searchParams: Promise.resolve({campaignDraft: draftId}),
    }));

    expect(screen.getByRole("alert")).toHaveTextContent(en.Admin.campaigns.error);
  });
});

describe("the campaign detail page", () => {
  beforeEach(() => {
    state.readCampaign.mockReset().mockResolvedValue({campaign: campaign(), report});
  });

  it("tells the creator a second administrator has to approve, and offers them no control", async () => {
    state.actorProfileId = creatorProfileId;

    render(await AdminCampaignDetailPage({params: Promise.resolve({locale: "en", id: campaignId})}));

    expect(screen.getByText(en.Admin.campaigns.ownDraft)).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: en.Admin.campaigns.actions.approve})).toBeNull();
    expect(screen.queryByRole("button", {name: en.Admin.campaigns.actions.reject})).toBeNull();
  });

  it("offers approve and reject to a different administrator", async () => {
    state.actorProfileId = reviewerProfileId;

    render(await AdminCampaignDetailPage({params: Promise.resolve({locale: "en", id: campaignId})}));

    expect(screen.getByRole("button", {name: en.Admin.campaigns.actions.approve})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: en.Admin.campaigns.actions.reject})).toBeInTheDocument();
    expect(screen.getByLabelText(en.Admin.campaigns.fields.scheduledAt)).toBeInTheDocument();
    expect(screen.queryByText(en.Admin.campaigns.ownDraft)).toBeNull();
  });

  it("offers an email reviewer no send time, and says why", async () => {
    state.actorProfileId = reviewerProfileId;
    state.readCampaign.mockResolvedValue({campaign: campaign({channel: "email", template: "member-update", templateKey: null}), report});

    render(await AdminCampaignDetailPage({params: Promise.resolve({locale: "en", id: campaignId})}));

    expect(screen.queryByLabelText(en.Admin.campaigns.fields.scheduledAt)).toBeNull();
    expect(screen.getByText(en.Admin.campaigns.scheduleUnavailable)).toBeInTheDocument();
  });

  it("shows the draft's own submit control to its creator only", async () => {
    state.actorProfileId = creatorProfileId;
    state.readCampaign.mockResolvedValue({campaign: campaign({status: "draft"}), report});

    render(await AdminCampaignDetailPage({params: Promise.resolve({locale: "en", id: campaignId})}));

    expect(screen.getByRole("button", {name: en.Admin.campaigns.actions.submitForReview})).toBeInTheDocument();
  });

  it("renders the delivery report, including the two counters the webhook fall-through writes", async () => {
    state.actorProfileId = reviewerProfileId;

    render(await AdminCampaignDetailPage({params: Promise.resolve({locale: "en", id: campaignId})}));

    expect(screen.getByText(en.Admin.campaigns.report.delivered)).toBeInTheDocument();
    expect(screen.getByText(en.Admin.campaigns.report.read)).toBeInTheDocument();
    // A send-time refusal is reported under its own reason, not folded away.
    expect(screen.getByText(en.Admin.campaigns.eligibility.not_opted_in)).toBeInTheDocument();
  });

  it("404s a campaign that does not exist and shows the error state when the read fails", async () => {
    state.actorProfileId = reviewerProfileId;
    state.readCampaign.mockResolvedValue(null);
    await expect(AdminCampaignDetailPage({params: Promise.resolve({locale: "en", id: campaignId})})).rejects.toThrow("NEXT_NOT_FOUND");

    state.readCampaign.mockRejectedValue(new Error("down"));
    render(await AdminCampaignDetailPage({params: Promise.resolve({locale: "en", id: campaignId})}));
    expect(screen.getByRole("alert")).toHaveTextContent(en.Admin.campaigns.error);
  });

  it("404s a malformed id before it reaches the repository", async () => {
    state.actorProfileId = reviewerProfileId;
    await expect(AdminCampaignDetailPage({params: Promise.resolve({locale: "en", id: "not-a-uuid"})})).rejects.toThrow("NEXT_NOT_FOUND");
    expect(state.readCampaign).not.toHaveBeenCalled();
  });
});
