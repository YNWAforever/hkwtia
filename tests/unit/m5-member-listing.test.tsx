import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {ShowcaseListingForm} from "@/components/portal/showcase-listing-form";
import {saveShowcaseDraft, submitShowcaseListing} from "@/lib/showcase/member-actions";
import {listingInputFromFormData} from "@/lib/showcase/member-contract";
import type {ShowcaseRepository} from "@/lib/db/repos/showcase";
import {actorFor} from "@/tests/helpers/fakes";

const input = {
  slug: "harbour-vision-ai",
  nameEn: "Harbour Vision AI",
  nameZhHk: "港灣視野 AI",
  taglineEn: "Trade intelligence",
  taglineZhHk: "貿易智能",
  descriptionEn: "Public description",
  descriptionZhHk: "公開描述",
  category: "software",
  useCases: ["logistics"],
  deploymentOptions: ["cloud"],
  supportedLanguages: ["en", "zh-HK"],
  worksWith: ["ERP"],
  videoUrl: null,
  caseStudyUrl: null,
  caseStudySummaryEn: null,
  caseStudySummaryZhHk: null,
  logoReference: null,
};

function repository(): ShowcaseRepository {
  return {
    upsertDraft: vi.fn(async (_actor, _companyId, value, status = "draft") => ({...value, status}) as never),
    submitForReview: vi.fn(async (_actor, _companyId, value) => ({...value, status: "pending_review"}) as never),
  } as unknown as ShowcaseRepository;
}

describe("member Showcase listing lifecycle", () => {
  it("maps FormData arrays and nullable fields through the shared schema", () => {
    const formData = new FormData();
    for (const [key, value] of Object.entries({
      ...input,
      useCases: "logistics,trade",
      deploymentOptions: "cloud",
      supportedLanguages: "en,zh-HK",
      worksWith: "ERP,CRM",
      videoUrl: "",
      caseStudyUrl: "",
      caseStudySummaryEn: "",
      caseStudySummaryZhHk: "",
      logoReference: "",
    })) formData.set(key, String(value));

    expect(listingInputFromFormData(formData)).toMatchObject({
      slug: input.slug,
      useCases: ["logistics", "trade"],
      supportedLanguages: ["en", "zh-HK"],
      videoUrl: null,
    });
  });

  it("saves draft and submits review through actor-scoped repository methods", async () => {
    const actor = actorFor("member-a");
    const repo = repository();
    await saveShowcaseDraft(actor, "company-a", input, repo);
    await submitShowcaseListing(actor, "company-a", input, repo);
    expect(repo.upsertDraft).toHaveBeenCalledWith(actor, "company-a", input, "draft");
    expect(repo.submitForReview).toHaveBeenCalledWith(actor, "company-a", input);
  });

  it("renders an accessible form with separate draft and review actions", () => {
    render(<ShowcaseListingForm
      value={input}
      labels={{
        title: "Showcase listing", slug: "Slug", nameEn: "Name", nameZhHk: "Chinese name", taglineEn: "Tagline", taglineZhHk: "Chinese tagline", descriptionEn: "Description", descriptionZhHk: "Chinese description", category: "Category", useCases: "Use cases", deploymentOptions: "Deployment", supportedLanguages: "Languages", worksWith: "Works with", videoUrl: "Video URL", caseStudyUrl: "Case study URL", caseStudySummaryEn: "Case study", caseStudySummaryZhHk: "Chinese case study", logoReference: "Logo", saveDraft: "Save draft", submit: "Submit for review",
      }}
      saveAction={async () => undefined}
      submitAction={async () => undefined}
      readOnly={false}
    />);

    expect(screen.getByRole("heading", {name: "Showcase listing"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Save draft"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Submit for review"})).toBeInTheDocument();
    expect(screen.getByLabelText("Slug")).toHaveValue("harbour-vision-ai");
  });
});
