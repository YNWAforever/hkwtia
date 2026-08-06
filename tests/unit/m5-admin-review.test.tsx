import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {ShowcaseReviewTable} from "@/components/admin/showcase-review-table";
import {
  publishShowcaseListing,
  rejectShowcaseListing,
  setShowcasePremium,
} from "@/lib/admin/showcase-core";
import type {ShowcaseRepository} from "@/lib/db/repos/showcase";
import type {AdminActor} from "@/lib/membership/lifecycle";

const staff = {kind: "staff", userId: "staff-1", profileId: "staff-1"} as AdminActor;
const row = {
  id: "listing-1", companyId: "company-1", slug: "harbour-vision-ai", status: "pending_review" as const, premium: false, goneGlobal: false, views: 0, memberSince: "2020-01-01",
  nameEn: "Harbour Vision AI", nameZhHk: "港灣視野 AI", taglineEn: "Trade intelligence", taglineZhHk: "貿易智能", descriptionEn: "Description", descriptionZhHk: "描述", category: "software", useCases: ["logistics"], deploymentOptions: ["cloud"], supportedLanguages: ["en"], worksWith: ["ERP"], videoUrl: null, caseStudyUrl: null, caseStudySummaryEn: null, caseStudySummaryZhHk: null, logoReference: null, logoMediaId: null, reviewedAt: null, reviewedByProfileId: null, rejectionReason: null, createdAt: new Date(), updatedAt: new Date(),
};

function repository(): ShowcaseRepository {
  return {
    publish: vi.fn(async () => ({...row, status: "published"})) as never,
    reject: vi.fn(async () => ({...row, status: "rejected", rejectionReason: "Needs detail"})) as never,
    setPremium: vi.fn(async (_actor, _id, premium) => ({...row, premium})) as never,
  } as unknown as ShowcaseRepository;
}

describe("staff Showcase review", () => {
  it("publishes, rejects, and changes premium state through admin actions", async () => {
    const repo = repository();
    await publishShowcaseListing(staff, row.id, repo);
    await rejectShowcaseListing(staff, row.id, "Needs detail", repo);
    await setShowcasePremium(staff, row.id, true, repo);
    expect(repo.publish).toHaveBeenCalledWith(staff, row.id);
    expect(repo.reject).toHaveBeenCalledWith(staff, row.id, "Needs detail");
    expect(repo.setPremium).toHaveBeenCalledWith(staff, row.id, true);
  });

  it("requires a non-empty rejection reason before calling the repository", async () => {
    const repo = repository();
    await expect(rejectShowcaseListing(staff, row.id, "  ", repo)).rejects.toThrow();
    expect(repo.reject).not.toHaveBeenCalled();
  });

  it("renders review rows with explicit accessible controls", () => {
    render(<ShowcaseReviewTable listings={[row]} labels={{caption: "Listings", company: "Company", slug: "Slug", logo: "Logo", status: "Status", premium: "Premium", publish: "Publish", reject: "Reject", rejectionReason: "Rejection reason", savePremium: "Save premium", logoNone: "No logo", saveLogo: "Save logo"}} publishAction={async () => undefined} rejectAction={async () => undefined} premiumAction={async () => undefined} />);
    expect(screen.getByText("Harbour Vision AI")).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Publish"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Reject"})).toBeInTheDocument();
    expect(screen.getByLabelText("Rejection reason")).toBeInTheDocument();
  });
});
