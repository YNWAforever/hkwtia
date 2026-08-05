import type {ListingInput} from "@/lib/showcase/contracts";

export type ShowcaseListingFormLabels = Readonly<{
  title: string;
  slug: string;
  nameEn: string;
  nameZhHk: string;
  taglineEn: string;
  taglineZhHk: string;
  descriptionEn: string;
  descriptionZhHk: string;
  category: string;
  useCases: string;
  deploymentOptions: string;
  supportedLanguages: string;
  worksWith: string;
  videoUrl: string;
  caseStudyUrl: string;
  caseStudySummaryEn: string;
  caseStudySummaryZhHk: string;
  logoReference: string;
  saveDraft: string;
  submit: string;
}>;

type Action = (formData: FormData) => void | Promise<void>;

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
  const list = (key: "useCases" | "deploymentOptions" | "supportedLanguages" | "worksWith") =>
    (value[key] ?? []).join(", ");
  return (
    <section className="glass-card space-y-6 p-5 sm:p-8">
      <h2 className="font-serif text-2xl font-semibold">{labels.title}</h2>
      <form action={submitAction} className="grid gap-5 sm:grid-cols-2">
        <input name="companyId" type="hidden" value={companyId ?? ""} />
        {([
          ["slug", labels.slug], ["nameEn", labels.nameEn], ["nameZhHk", labels.nameZhHk],
          ["taglineEn", labels.taglineEn], ["taglineZhHk", labels.taglineZhHk], ["category", labels.category],
          ["videoUrl", labels.videoUrl], ["caseStudyUrl", labels.caseStudyUrl], ["logoReference", labels.logoReference],
        ] as const).map(([name, label]) => (
          <label className="space-y-2 text-sm font-medium" key={name}>
            <span>{label}</span>
            <input className="min-h-11 w-full rounded-md border border-input bg-background px-3 disabled:opacity-60" disabled={readOnly} name={name} defaultValue={text(name)} />
          </label>
        ))}
        {([
          ["useCases", labels.useCases], ["deploymentOptions", labels.deploymentOptions], ["supportedLanguages", labels.supportedLanguages], ["worksWith", labels.worksWith],
        ] as const).map(([name, label]) => (
          <label className="space-y-2 text-sm font-medium" key={name}>
            <span>{label}</span>
            <input className="min-h-11 w-full rounded-md border border-input bg-background px-3 disabled:opacity-60" disabled={readOnly} name={name} defaultValue={list(name)} />
          </label>
        ))}
        {([
          ["descriptionEn", labels.descriptionEn], ["descriptionZhHk", labels.descriptionZhHk], ["caseStudySummaryEn", labels.caseStudySummaryEn], ["caseStudySummaryZhHk", labels.caseStudySummaryZhHk],
        ] as const).map(([name, label]) => (
          <label className="space-y-2 text-sm font-medium sm:col-span-2" key={name}>
            <span>{label}</span>
            <textarea className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 disabled:opacity-60" disabled={readOnly} name={name} defaultValue={text(name)} />
          </label>
        ))}
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <button className="inline-flex min-h-11 items-center justify-center rounded-md border border-input px-4 py-2 text-sm font-medium disabled:opacity-50" disabled={readOnly} formAction={saveAction} type="submit">{labels.saveDraft}</button>
          <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={readOnly} type="submit">{labels.submit}</button>
        </div>
      </form>
    </section>
  );
}
