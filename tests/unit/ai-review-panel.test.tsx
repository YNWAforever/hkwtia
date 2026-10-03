import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import en from "@/messages/en.json";
const actions = vi.hoisted(() => ({
  review: vi.fn(),
  edit: vi.fn(),
  refresh: vi.fn(),
  setDirty: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: actions.refresh }),
}));
vi.mock("@/lib/admin/ai-draft-actions", () => ({
  reviewAiDraftAction: actions.review,
  editAiDraftAction: actions.edit,
}));
vi.mock("@/components/admin/unsaved-changes-guard", () => ({
  useAdminUnsavedChanges: () => ({
    setDirty: actions.setDirty,
    confirmLeave: () => true,
  }),
}));
import { AiReviewPanel } from "@/components/admin/ai-review-panel";
import type { AdminAiDraft } from "@/lib/ai/drafts/contracts";
const draft: AdminAiDraft = {
  id: "00000000-0000-4000-8000-000000000008",
  version: 2,
  kind: "support",
  caseId: "synthetic-case",
  factsHash: "a".repeat(64),
  ownerId: "synthetic-owner",
  dueAt: null,
  sourceRefs: [],
  claims: [],
  body: "Please contact staff.",
  state: "needs_review",
  modelRoute: "synthetic-test-route",
  promptVersion: "v1",
  runId: "00000000-0000-4000-8000-000000000009",
};
const details = {
  draft,
  renderedBody: "Please contact staff.",
  violations: [],
  previousBody: "Earlier verified text.",
  createdAt: "2040-01-01T00:00:00Z",
  updatedAt: "2040-01-01T00:00:00Z",
  facts: null,
  factsAvailable: true,
  costMicrousd: null,
  usageState: "unknown",
};
describe("draft review evidence and action separation", () => {
  it("shows final body, frozen prior body, version and unknown cost instead of fabricated zero", () => {
    render(
      <AiReviewPanel details={details} labels={en.AiDraftReview} enabled />,
    );
    expect(screen.getByText("Earlier verified text.")).toBeInTheDocument();
    expect(screen.getByText("synthetic-test-route")).toBeInTheDocument();
    expect(
      screen.getAllByText(en.AiDraftReview.unknownCost).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: /send|publish/i }),
    ).not.toBeInTheDocument();
  });
  it("review passes expected version and decision only, with no client actor or adoption/send", async () => {
    actions.review.mockResolvedValue({ status: "saved" });
    render(
      <AiReviewPanel details={details} labels={en.AiDraftReview} enabled />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: en.AiDraftReview.approve }),
    );
    await waitFor(() =>
      expect(actions.review).toHaveBeenCalledWith({
        draftId: draft.id,
        expectedVersion: 2,
        decision: "approve",
      }),
    );
    expect(actions.edit).not.toHaveBeenCalled();
  });
  it("stale source and unavailable facts disable approval while keeping manual text visible", () => {
    render(
      <AiReviewPanel
        details={{
          ...details,
          factsAvailable: false,
          draft: { ...draft, state: "stale" },
        }}
        labels={en.AiDraftReview}
        enabled
      />,
    );
    expect(
      screen.getByRole("button", { name: en.AiDraftReview.approve }),
    ).toBeDisabled();
    expect(
      screen.getByText(en.AiDraftReview.manualFallback),
    ).toBeInTheDocument();
  });
  it("does not present an unknown provider cost as a verified zero", () => {
    render(
      <AiReviewPanel
        details={{ ...details, costMicrousd: 0, usageState: "unknown" }}
        labels={en.AiDraftReview}
        enabled
      />,
    );
    expect(
      screen.getByText(en.AiDraftReview.cost, { selector: "dt" })
        .nextElementSibling,
    ).toHaveTextContent(en.AiDraftReview.unknownCost);
  });
});
