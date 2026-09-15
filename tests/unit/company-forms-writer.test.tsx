import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

vi.mock("@/lib/portal/writer-actions", () => ({
  writerAssistAction: vi.fn(async () => ({status: "ok", copy: {taglineEn: "EN tag", taglineZhHk: "ZH tag", description: "EN desc", descriptionZhHk: "ZH desc"}})),
}));
vi.mock("@/components/portal/hero-upload", () => ({HeroUpload: () => null}));

import {CompanyForms} from "@/components/portal/company-forms";
import type {WriterAssistProps} from "@/components/portal/writer-assist";

const writerProps: WriterAssistProps = {
  kind: "profile", quotaLabel: "Unlimited generations", exhausted: false,
  labels: {label: "Write with AI", briefLabel: "What is this about?", briefPlaceholder: "Notes", generate: "Generate", generating: "Generating…", errors: {INVALID: "Invalid", FORBIDDEN: "Forbidden", NOT_ENTITLED: "Not entitled", QUOTA_EXCEEDED: "Quota", UNAVAILABLE: "Unavailable", FAILED: "Failed"}},
};

const detailLabels = {legalName: "Legal name", displayName: "Display name", website: "Website", industry: "Industry", sizeBand: "Size", description: "Description (EN)", save: "Save", readOnly: "Read only"};
const profileLabels = {fields: {slug: "Slug", taglineEn: "Tagline (EN)", taglineZhHk: "Tagline (ZH)", descriptionZhHk: "Description (ZH)", website: "Website", tags: "Tags", logoMediaId: "Logo"}, logo: {choose: "Choose", alt: "Alt", upload: "Upload", uploading: "Uploading", done: "Done", failed: "Failed"}, status: {hidden: "Hidden", pending_review: "In review", published: "Published", rejected: "Rejected"}, statusLabel: "Status", reviewNotice: "Notice", rejected: null, save: "Save", publish: "Publish", saved: "Saved", submitted: "Submitted", readOnly: "Read only", viewPublic: "View", errors: {}};

describe("CompanyForms writer integration", () => {
  it("fills the English description and both taglines and the Chinese description", async () => {
    render(<CompanyForms
      details={{values: {companyId: "acme", legalName: "Acme", displayName: "Acme", website: "", industry: "", sizeBand: "", description: ""}, labels: detailLabels, action: async () => {}, canManage: true}}
      profile={{values: {slug: "acme", taglineEn: "", taglineZhHk: "", descriptionZhHk: "", website: "", logoMediaId: "", tags: [], status: "hidden", rejectionReason: null}, labels: profileLabels, action: async () => ({status: "idle"}), locale: "en", readOnly: false, publicHref: null}}
      writer={writerProps}
    />);

    fireEvent.click(screen.getByText("Write with AI"));
    fireEvent.change(screen.getByLabelText("What is this about?"), {target: {value: "Acme"}});
    fireEvent.click(screen.getByRole("button", {name: "Generate"}));

    expect(await screen.findByDisplayValue("EN desc")).toBeVisible();
    expect(screen.getByDisplayValue("EN tag")).toBeVisible();
    expect(screen.getByDisplayValue("ZH tag")).toBeVisible();
    expect(screen.getByDisplayValue("ZH desc")).toBeVisible();
  });

  it("offers no control to a read-only member", () => {
    render(<CompanyForms
      details={{values: {companyId: "acme", legalName: "Acme", displayName: "Acme", website: "", industry: "", sizeBand: "", description: ""}, labels: detailLabels, action: undefined, canManage: false}}
      profile={{values: {slug: "acme", taglineEn: "", taglineZhHk: "", descriptionZhHk: "", website: "", logoMediaId: "", tags: [], status: "hidden", rejectionReason: null}, labels: profileLabels, action: async () => ({status: "idle"}), locale: "en", readOnly: true, publicHref: null}}
      writer={writerProps}
    />);

    expect(screen.queryByText("Write with AI")).not.toBeInTheDocument();
  });

  // Regression: the page can assemble these props from two different companies —
  // the first (unmanaged, so the details textarea is disabled) and the first
  // *managed* one (so the profile form is editable). Offering the control then
  // filled an English description into a field that could never be saved.
  it("offers no control when the details form is read-only even if the profile form is not", () => {
    render(<CompanyForms
      details={{values: {companyId: "acme", legalName: "Acme", displayName: "Acme", website: "", industry: "", sizeBand: "", description: ""}, labels: detailLabels, action: undefined, canManage: false}}
      profile={{values: {slug: "acme", taglineEn: "", taglineZhHk: "", descriptionZhHk: "", website: "", logoMediaId: "", tags: [], status: "hidden", rejectionReason: null}, labels: profileLabels, action: async () => ({status: "idle"}), locale: "en", readOnly: false, publicHref: null}}
      writer={writerProps}
    />);

    expect(screen.queryByText("Write with AI")).not.toBeInTheDocument();
  });
});
