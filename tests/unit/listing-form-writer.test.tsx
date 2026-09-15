import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

vi.mock("@/lib/portal/writer-actions", () => ({
  writerAssistAction: vi.fn(async () => ({status: "ok", copy: {taglineEn: "EN tag", taglineZhHk: "ZH tag", descriptionEn: "EN desc", descriptionZhHk: "ZH desc"}})),
}));

import {ShowcaseListingForm} from "@/components/portal/showcase-listing-form";
import type {WriterAssistProps} from "@/components/portal/writer-assist";

const writerProps: WriterAssistProps = {
  kind: "listing", quotaLabel: "Unlimited generations", exhausted: false,
  labels: {label: "Write with AI", briefLabel: "What is this about?", briefPlaceholder: "Notes", generate: "Generate", generating: "Generating…", errors: {INVALID: "Invalid", FORBIDDEN: "Forbidden", NOT_ENTITLED: "Not entitled", QUOTA_EXCEEDED: "Quota", UNAVAILABLE: "Unavailable", FAILED: "Failed"}},
};

const labels = {title: "Listing", slug: "Slug", nameEn: "Name (EN)", nameZhHk: "Name (ZH)", taglineEn: "Tagline (EN)", taglineZhHk: "Tagline (ZH)", descriptionEn: "Description (EN)", descriptionZhHk: "Description (ZH)", category: "Category", useCases: "Use cases", deploymentOptions: "Deployment", supportedLanguages: "Languages", worksWith: "Works with", videoUrl: "Video", caseStudyUrl: "Case study", caseStudySummaryEn: "Summary (EN)", caseStudySummaryZhHk: "Summary (ZH)", logoReference: "Logo", saveDraft: "Save", submit: "Submit"};

describe("ShowcaseListingForm writer integration", () => {
  it("fills the taglines and descriptions from one generation", async () => {
    render(<ShowcaseListingForm value={{}} labels={labels} readOnly={false} writer={writerProps} />);

    fireEvent.click(screen.getByText("Write with AI"));
    fireEvent.change(screen.getByLabelText("What is this about?"), {target: {value: "Our product"}});
    fireEvent.click(screen.getByRole("button", {name: "Generate"}));

    expect(await screen.findByDisplayValue("EN tag")).toBeVisible();
    expect(screen.getByDisplayValue("ZH tag")).toBeVisible();
    expect(screen.getByDisplayValue("EN desc")).toBeVisible();
    expect(screen.getByDisplayValue("ZH desc")).toBeVisible();
  });

  it("offers no control on a read-only listing", () => {
    render(<ShowcaseListingForm value={{}} labels={labels} readOnly writer={writerProps} />);

    expect(screen.queryByText("Write with AI")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Tagline (EN)")).toBeDisabled();
    expect(screen.getByLabelText("Description (ZH)")).toBeDisabled();
  });

  it("renders no control when the surface passes none", () => {
    render(<ShowcaseListingForm value={{}} labels={labels} readOnly={false} />);

    expect(screen.queryByText("Write with AI")).not.toBeInTheDocument();
  });
});
