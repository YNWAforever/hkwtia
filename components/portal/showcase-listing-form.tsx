"use client";

import {useState} from "react";

import {WriterAssist, type WriterAssistProps} from "@/components/portal/writer-assist";
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

/**
 * The four fields a generation fills, in the order they render. Every other
 * field stays uncontrolled: a re-render of the copy state must not remount the
 * rest of the form.
 */
const copyFields = ["taglineEn", "taglineZhHk", "descriptionEn", "descriptionZhHk"] as const;
type CopyField = (typeof copyFields)[number];

export function ShowcaseListingForm({
  value,
  labels,
  saveAction,
  submitAction,
  readOnly,
  companyId,
  writer = null,
}: Readonly<{
  value: Partial<ListingInput>;
  labels: ShowcaseListingFormLabels;
  saveAction?: Action;
  submitAction?: Action;
  readOnly: boolean;
  companyId?: string;
  writer?: WriterAssistProps | null;
}>) {
  const [copy, setCopy] = useState<Partial<Record<CopyField, string>>>({});
  const text = (key: keyof ListingInput) => String(value[key] ?? "");
  const list = (key: "useCases" | "deploymentOptions" | "supportedLanguages" | "worksWith") =>
    (value[key] ?? []).join(", ");
  const copyInput = (name: CopyField) => (
    <label className="space-y-2 text-sm font-medium" key={name}>
      <span>{labels[name]}</span>
      <input className="min-h-11 w-full rounded-md border border-input bg-background px-3 disabled:opacity-60" disabled={readOnly} name={name} onChange={(event) => setCopy((current) => ({...current, [name]: event.target.value}))} value={copy[name] ?? text(name)} />
    </label>
  );
  const copyTextarea = (name: CopyField) => (
    <label className="space-y-2 text-sm font-medium sm:col-span-2" key={name}>
      <span>{labels[name]}</span>
      <textarea className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 disabled:opacity-60" disabled={readOnly} name={name} onChange={(event) => setCopy((current) => ({...current, [name]: event.target.value}))} value={copy[name] ?? text(name)} />
    </label>
  );
  return (
    <section className="glass-card space-y-6 p-5 sm:p-8">
      <h2 className="font-serif text-2xl font-semibold">{labels.title}</h2>
      <form action={submitAction} className="grid gap-5 sm:grid-cols-2">
        <input name="companyId" type="hidden" value={companyId ?? ""} />
        {([
          ["slug", labels.slug], ["nameEn", labels.nameEn], ["nameZhHk", labels.nameZhHk],
        ] as const).map(([name, label]) => (
          <label className="space-y-2 text-sm font-medium" key={name}>
            <span>{label}</span>
            <input className="min-h-11 w-full rounded-md border border-input bg-background px-3 disabled:opacity-60" disabled={readOnly} name={name} defaultValue={text(name)} />
          </label>
        ))}
        {copyFields.slice(0, 2).map(copyInput)}
        {([
          ["category", labels.category], ["videoUrl", labels.videoUrl], ["caseStudyUrl", labels.caseStudyUrl], ["logoReference", labels.logoReference],
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
        {copyFields.slice(2).map(copyTextarea)}
        {([
          ["caseStudySummaryEn", labels.caseStudySummaryEn], ["caseStudySummaryZhHk", labels.caseStudySummaryZhHk],
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
      {writer && !readOnly ? (
        <div className="mt-4">
          <WriterAssist
            kind="listing"
            labels={writer.labels}
            quotaLabel={writer.quotaLabel}
            exhausted={writer.exhausted}
            onGenerated={(generated) => setCopy((current) => ({
              ...current,
              taglineEn: generated.taglineEn ?? current.taglineEn,
              taglineZhHk: generated.taglineZhHk ?? current.taglineZhHk,
              descriptionEn: generated.descriptionEn ?? current.descriptionEn,
              descriptionZhHk: generated.descriptionZhHk ?? current.descriptionZhHk,
            }))}
          />
        </div>
      ) : null}
    </section>
  );
}
