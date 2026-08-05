import {listingInputSchema, type ListingInput} from "@/lib/showcase/contracts";

function textField(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function optionalTextField(formData: FormData, name: string): string | null {
  const value = textField(formData, name);
  return value || null;
}

function listField(formData: FormData, name: string): string[] {
  return textField(formData, name)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function listingInputFromFormData(formData: FormData): ListingInput {
  return listingInputSchema.parse({
    slug: textField(formData, "slug"),
    nameEn: textField(formData, "nameEn"),
    nameZhHk: textField(formData, "nameZhHk"),
    taglineEn: textField(formData, "taglineEn"),
    taglineZhHk: textField(formData, "taglineZhHk"),
    descriptionEn: textField(formData, "descriptionEn"),
    descriptionZhHk: textField(formData, "descriptionZhHk"),
    category: textField(formData, "category"),
    useCases: listField(formData, "useCases"),
    deploymentOptions: listField(formData, "deploymentOptions"),
    supportedLanguages: listField(formData, "supportedLanguages"),
    worksWith: listField(formData, "worksWith"),
    videoUrl: optionalTextField(formData, "videoUrl"),
    caseStudyUrl: optionalTextField(formData, "caseStudyUrl"),
    caseStudySummaryEn: optionalTextField(formData, "caseStudySummaryEn"),
    caseStudySummaryZhHk: optionalTextField(formData, "caseStudySummaryZhHk"),
    logoReference: optionalTextField(formData, "logoReference"),
  });
}
