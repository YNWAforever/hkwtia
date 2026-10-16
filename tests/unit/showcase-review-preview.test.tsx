import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {ShowcaseReviewTable, type ShowcaseReviewLabels} from "@/components/admin/showcase-review-table";
import type {ReviewShowcaseRow} from "@/lib/db/repos/showcase";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

const row = {
  id: "listing-1", companyId: "company-1", slug: "review-preview", status: "pending_review",
  reviewVersion: "42", premium: false, goneGlobal: false, views: 0, memberSince: "2020-01-01",
  nameEn: "English product name", nameZhHk: "繁體產品名稱",
  taglineEn: "English sales tagline", taglineZhHk: "繁體銷售標語",
  descriptionEn: "English product description awaiting review.",
  descriptionZhHk: "繁體產品描述等待審核。", category: "analytics",
  useCases: ["Logistics", "Retail"], deploymentOptions: ["Cloud", "On premise"],
  supportedLanguages: ["English", "Chinese"], worksWith: ["ERP", "CRM"],
  videoUrl: "https://video.example.test/demo", caseStudyUrl: "https://study.example.test/story",
  caseStudySummaryEn: "English customer outcome.", caseStudySummaryZhHk: "繁體客戶成果。",
  logoReference: "https://logo.example.test/image", logoMediaId: null,
  reviewedAt: null, reviewedByProfileId: null, rejectionReason: null,
  createdAt: new Date("2020-01-01"), updatedAt: new Date("2020-01-01"),
} as ReviewShowcaseRow;
const noop = () => {};

function html(labels: ShowcaseReviewLabels) {
  return renderToStaticMarkup(<ShowcaseReviewTable listings={[row]} labels={labels}
    publishAction={noop} rejectAction={noop} premiumAction={noop}/>);
}

describe("showcase staff review preview", () => {
  it("shows the bilingual copy and every member-supplied public field before approval", () => {
    const labels: ShowcaseReviewLabels = {...en.Admin.listingsReview, fields: en.Portal.showcaseListing.fields};
    const output = html(labels);
    for (const value of [
      row.nameEn, row.nameZhHk, row.taglineEn, row.taglineZhHk,
      row.descriptionEn, row.descriptionZhHk, row.category,
      "Logistics, Retail", "Cloud, On premise", "English, Chinese", "ERP, CRM",
      row.videoUrl, row.caseStudyUrl, row.caseStudySummaryEn, row.caseStudySummaryZhHk,
    ]) expect(output).toContain(value);
    for (const term of [labels.fields.nameEn, labels.fields.slug, labels.fields.descriptionEn, labels.fields.descriptionZhHk,
      labels.fields.category, labels.fields.caseStudyUrl]) expect(output).toContain(term);
  });

  it("labels the review preview in the staff member's selected language", () => {
    const labels: ShowcaseReviewLabels = {...zh.Admin.listingsReview, fields: zh.Portal.showcaseListing.fields};
    const output = html(labels);
    expect(output).toContain(labels.preview);
    expect(output).toContain(labels.fields.nameEn);
    expect(output).toContain(labels.fields.slug);
    expect(output).toContain(labels.fields.descriptionZhHk);
    expect(output).toContain(labels.fields.caseStudySummaryEn);
  });
});
