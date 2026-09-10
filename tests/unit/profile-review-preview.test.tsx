import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {ProfileReviewTable, type ProfileReviewLabels, type ProfileReviewRow} from "@/components/admin/profile-review-table";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

/**
 * The moderation invariant, from the reviewer's side. `PUBLICLY_RENDERED_COLUMNS`
 * in `lib/db/repos/companies.ts` lists the five columns whose rewrite drags a
 * published profile back to `pending_review`, and `reviewResetFor` there is what
 * drags it. A reviewer who cannot see one of those columns cannot judge the edit
 * they were called in for: they would publish the English description they were
 * never shown. The reviewer cannot open the page either — it is `pending_review`,
 * so `/members/[slug]` 404s until they approve — so this table is the only
 * preview there is, and it has to cover all five.
 */
const labels: ProfileReviewLabels = en.Admin.profilesReview;

const row: ProfileReviewRow = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Acme Wireless",
  slug: "acme-wireless",
  tags: ["ai"],
  website: "https://acme.example/en",
  taglineEn: "Wireless for Hong Kong",
  taglineZhHk: "香港無線",
  descriptionEn: "Rewritten English prose the owner saved from the portal.",
  descriptionZhHk: "由會員在會員專區重寫的中文簡介。",
  industry: "Logistics technology",
  sizeBand: "51-200",
  logoUrl: null,
};

const noop = () => {};

describe("profile review preview", () => {
  it("previews every column whose rewrite sends a published profile back to review", () => {
    const html = renderToStaticMarkup(<ProfileReviewTable approveAction={noop} labels={labels} locale="en" rejectAction={noop} rows={[row]}/>);

    // displayName is the row's own column; the other four live in the preview.
    expect(html).toContain("Acme Wireless");
    expect(html).toContain("https://acme.example/en");
    expect(html).toContain("Rewritten English prose the owner saved from the portal.");
    expect(html).toContain("Logistics technology");
    expect(html).toContain("51-200");
    // The profile-only copy the member edits in the same form.
    expect(html).toContain("Wireless for Hong Kong");
    expect(html).toContain("香港無線");
    expect(html).toContain("由會員在會員專區重寫的中文簡介。");
    // Each value is termed, so a reviewer knows which field they are reading.
    for (const term of [labels.descriptionEn, labels.industry, labels.sizeBand]) {
      expect(html).toContain(term);
    }
  });

  it("does not call a profile empty when the English description is the only copy on it", () => {
    const html = renderToStaticMarkup(<ProfileReviewTable approveAction={noop} labels={labels} locale="en" rejectAction={noop} rows={[{
      ...row, website: null, taglineEn: null, taglineZhHk: null, descriptionZhHk: null, industry: null, sizeBand: null,
    }]}/>);

    expect(html).toContain("Rewritten English prose the owner saved from the portal.");
    expect(html).not.toContain(labels.previewEmpty);
  });

  it("terms the preview in the reviewer's own language (CLAUDE.md rule 6)", () => {
    const zhLabels: ProfileReviewLabels = zh.Admin.profilesReview;
    const html = renderToStaticMarkup(<ProfileReviewTable approveAction={noop} labels={zhLabels} locale="zh-HK" rejectAction={noop} rows={[row]}/>);

    for (const term of [zhLabels.descriptionEn, zhLabels.industry, zhLabels.sizeBand]) {
      expect(term).not.toBe("");
      expect(html).toContain(term);
    }
  });
});
