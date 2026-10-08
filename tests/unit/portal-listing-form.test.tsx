import {render} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {ShowcaseListingForm, type ShowcaseListingFormLabels} from "@/components/portal/showcase-listing-form";
import {listingInputFromFormData} from "@/lib/showcase/member-contract";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

const labels: ShowcaseListingFormLabels = {
  title: "Listing details",
  groups: {basics: "Basics", nameTagline: "Name and tagline", descriptions: "Descriptions", details: "Details", links: "Links and media"},
  fields: {
    slug: "Slug", nameEn: "English name", nameZhHk: "Chinese name", taglineEn: "English tagline", taglineZhHk: "Chinese tagline",
    descriptionEn: "English description", descriptionZhHk: "Chinese description", category: "Category", useCases: "Use cases",
    deploymentOptions: "Deployment options", supportedLanguages: "Supported languages", worksWith: "Works with", videoUrl: "Video URL",
    caseStudyUrl: "Case study URL", caseStudySummaryEn: "English case study", caseStudySummaryZhHk: "Chinese case study",
  },
  logo: {
    label: "Logo", empty: "No logo yet", previewAlt: "Current logo", external: "Linked image", remove: "Remove",
    upload: {choose: "Choose", alt: "Alt", upload: "Upload", uploading: "Uploading", done: "Done", failed: "Failed"},
  },
  commaHelp: "Separate with commas",
  readOnly: "Only owners can edit.",
  saveDraft: "Save draft",
  submit: "Submit for review",
};

const value = {slug: "harbour", nameEn: "Harbour", logoReference: "/api/media/11111111-2222-4333-8444-555555555555", useCases: ["a", "b"]};

function mount(readOnly = false) {
  return render(<ShowcaseListingForm companyId="c1" labels={labels} readOnly={readOnly} saveAction={async () => undefined} submitAction={async () => undefined} value={value} />).container;
}

/** Every name the member action reads from FormData, derived by running the parser against a recording stub. */
function namesParserReads(): string[] {
  const seen = new Set<string>();
  const formData = {get: (name: string) => { seen.add(name); return ""; }} as unknown as FormData;
  try { listingInputFromFormData(formData); } catch { /* empty values fail validation; only the reads matter */ }
  return [...seen];
}

describe("showcase listing form (portal grammar)", () => {
  it("submits exactly the names the member contract reads, plus companyId", () => {
    const container = mount();
    const submitted = new Set([...container.querySelectorAll<HTMLElement>("input[name], textarea[name], select[name]")].map((el) => el.getAttribute("name")!));
    expect([...submitted].sort()).toEqual([...namesParserReads(), "companyId"].sort());
    expect(namesParserReads()).toHaveLength(17);
  });

  it("has five fieldsets with the group titles in order", () => {
    const titles = [...mount().querySelectorAll("fieldset > legend")].map((el) => el.textContent);
    expect(titles).toEqual(["Basics", "Name and tagline", "Descriptions", "Details", "Links and media"]);
  });

  it("keeps each English field and its Chinese twin in the same pair", () => {
    const container = mount();
    for (const [a, b] of [["nameEn", "nameZhHk"], ["taglineEn", "taglineZhHk"], ["descriptionEn", "descriptionZhHk"], ["caseStudySummaryEn", "caseStudySummaryZhHk"]]) {
      const pair = container.querySelector(`[name="${a}"]`)!.closest(".portal-pair")!;
      expect(pair, a).toBeTruthy();
      expect(pair.querySelector(`[name="${b}"]`), b).toBeTruthy();
      // English first, Chinese second.
      expect(pair.querySelector(`[name="${a}"]`)!.compareDocumentPosition(pair.querySelector(`[name="${b}"]`)!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("describes the four comma inputs with the comma help", () => {
    const container = mount();
    for (const name of ["useCases", "deploymentOptions", "supportedLanguages", "worksWith"]) {
      const input = container.querySelector(`[name="${name}"]`)!;
      const help = container.querySelector(`#${input.getAttribute("aria-describedby")}`);
      expect(help?.textContent, name).toBe("Separate with commas");
    }
    expect(container.querySelector<HTMLInputElement>('[name="useCases"]')!.value).toBe("a, b");
  });

  it("shows the logo as a hidden input, never a visible text input", () => {
    const container = mount();
    const logo = [...container.querySelectorAll<HTMLInputElement>('[name="logoReference"]')];
    expect(logo).toHaveLength(1);
    expect(logo[0].type).toBe("hidden");
    expect(logo[0].value).toBe(value.logoReference);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(value.logoReference);
  });

  it("keeps the Save draft and Submit for review buttons and one primary", () => {
    const container = mount();
    const buttons = [...container.querySelectorAll<HTMLButtonElement>(".portal-form-actions button")];
    expect(buttons.map((b) => b.textContent)).toEqual(["Save draft", "Submit for review"]);
    expect(buttons.map((b) => b.getAttribute("name"))).toEqual([null, null]);
    expect(container.querySelectorAll("button.button")).toHaveLength(1);
  });

  it("read-only disables controls, hides the buttons and shows the note", () => {
    const container = mount(true);
    expect(container.querySelector(".portal-readonly-note")?.textContent).toBe("Only owners can edit.");
    expect(container.querySelector(".portal-form-actions")).toBeNull();
    expect([...container.querySelectorAll<HTMLInputElement>("input:not([type=hidden]), textarea")].every((el) => el.disabled)).toBe(true);
    expect(container.textContent).not.toContain("Remove");
  });
});

describe("showcase listing copy", () => {
  it.each([["en", en], ["zh-HK", zh]] as const)("%s drops '(comma separated)' and defines the five groups", (_name, bundle) => {
    const listing = bundle.Portal.showcaseListing as unknown as {fields: Record<string, string>; groups: Record<string, string>};
    for (const key of ["useCases", "deploymentOptions", "supportedLanguages", "worksWith"]) {
      expect(listing.fields[key]).not.toMatch(/comma|逗號/i);
    }
    expect(Object.keys(listing.groups)).toEqual(["basics", "nameTagline", "descriptions", "details", "links"]);
  });
});
