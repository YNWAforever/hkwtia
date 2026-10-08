import {PortalImageField, type PortalImageFieldLabels} from "@/components/portal/forms/image-field";
import type {ListingInput} from "@/lib/showcase/contracts";

type FieldKey =
  | "slug" | "nameEn" | "nameZhHk" | "taglineEn" | "taglineZhHk" | "descriptionEn" | "descriptionZhHk" | "category"
  | "useCases" | "deploymentOptions" | "supportedLanguages" | "worksWith" | "videoUrl" | "caseStudyUrl"
  | "caseStudySummaryEn" | "caseStudySummaryZhHk";

export type ShowcaseListingFormLabels = Readonly<{
  title: string;
  groups: Readonly<{basics: string; nameTagline: string; descriptions: string; details: string; links: string}>;
  fields: Readonly<Record<FieldKey, string>>;
  logo: PortalImageFieldLabels;
  commaHelp: string;
  readOnly: string;
  saveDraft: string;
  submit: string;
}>;

type Action = (formData: FormData) => void | Promise<void>;
type ListKey = "useCases" | "deploymentOptions" | "supportedLanguages" | "worksWith";

/**
 * The listing keeps its field names, its two actions and its read-only behaviour; only the grammar
 * changed (five groups, English/Chinese twins on one row). `logoReference` is submitted by
 * `PortalImageField`'s hidden input, so there is no visible text input for it. The four list fields
 * stay comma-separated because `listingInputFromFormData` splits them on commas.
 */
export function ShowcaseListingForm({
  value,
  labels,
  saveAction,
  submitAction,
  readOnly,
  companyId,
}: Readonly<{
  value: Partial<ListingInput>;
  labels: ShowcaseListingFormLabels;
  saveAction?: Action;
  submitAction?: Action;
  readOnly: boolean;
  companyId?: string;
}>) {
  const text = (key: keyof ListingInput) => String(value[key] ?? "");
  const input = (name: FieldKey, defaultValue: string, helpId?: string) => (
    <div className="portal-field">
      <label htmlFor={`listing-${name}`}>{labels.fields[name]}</label>
      <input aria-describedby={helpId} defaultValue={defaultValue} disabled={readOnly} id={`listing-${name}`} name={name} type="text" />
      {helpId ? <p className="portal-field-help" id={helpId}>{labels.commaHelp}</p> : null}
    </div>
  );
  const plain = (name: FieldKey) => input(name, text(name as keyof ListingInput));
  const list = (name: ListKey) => input(name, (value[name] ?? []).join(", "), `listing-${name}-help`);
  const area = (name: FieldKey) => (
    <div className="portal-field">
      <label htmlFor={`listing-${name}`}>{labels.fields[name]}</label>
      <textarea defaultValue={text(name as keyof ListingInput)} disabled={readOnly} id={`listing-${name}`} name={name} />
    </div>
  );
  return (
    <section aria-labelledby="listing-form-heading" className="portal-form-section">
      <div className="portal-section-head">
        <h2 className="portal-section-title" id="listing-form-heading">{labels.title}</h2>
      </div>
      <form action={submitAction} className="portal-form">
        <input name="companyId" type="hidden" value={companyId ?? ""} />
        <fieldset className="portal-fieldset">
          <legend className="portal-fieldset-title">{labels.groups.basics}</legend>
          <div className="portal-pair">{plain("slug")}{plain("category")}</div>
        </fieldset>
        <fieldset className="portal-fieldset">
          <legend className="portal-fieldset-title">{labels.groups.nameTagline}</legend>
          <div className="portal-pair">{plain("nameEn")}{plain("nameZhHk")}</div>
          <div className="portal-pair">{plain("taglineEn")}{plain("taglineZhHk")}</div>
        </fieldset>
        <fieldset className="portal-fieldset">
          <legend className="portal-fieldset-title">{labels.groups.descriptions}</legend>
          <div className="portal-pair">{area("descriptionEn")}{area("descriptionZhHk")}</div>
        </fieldset>
        <fieldset className="portal-fieldset">
          <legend className="portal-fieldset-title">{labels.groups.details}</legend>
          <div className="portal-pair">{list("useCases")}{list("deploymentOptions")}</div>
          <div className="portal-pair">{list("supportedLanguages")}{list("worksWith")}</div>
        </fieldset>
        <fieldset className="portal-fieldset">
          <legend className="portal-fieldset-title">{labels.groups.links}</legend>
          <div className="portal-pair">{plain("videoUrl")}{plain("caseStudyUrl")}</div>
          <div className="portal-pair">{area("caseStudySummaryEn")}{area("caseStudySummaryZhHk")}</div>
          <PortalImageField initialValue={text("logoReference")} labels={labels.logo} name="logoReference" readOnly={readOnly} store="path" />
        </fieldset>
        {readOnly ? <p className="portal-readonly-note">{labels.readOnly}</p> : (
          <div className="portal-form-actions">
            <button className="portal-button-outline" formAction={saveAction} type="submit">{labels.saveDraft}</button>
            <button className="button" type="submit">{labels.submit}</button>
          </div>
        )}
      </form>
    </section>
  );
}
