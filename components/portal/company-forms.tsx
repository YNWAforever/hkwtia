"use client";

import {useState} from "react";

import {
  CompanyProfileForm,
  type CompanyProfileFormLabels,
  type CompanyProfileValues,
} from "@/components/portal/company-profile-form";
import {WriterAssist, type WriterAssistProps} from "@/components/portal/writer-assist";
import type {AppLocale} from "@/i18n/routing";
import type {CompanyProfileFormState} from "@/lib/portal/company-profile-actions";

export type CompanyDetailsValues = Readonly<{
  companyId: string; legalName: string; displayName: string; website: string; industry: string; sizeBand: string; description: string;
}>;

export type CompanyDetailsLabels = Readonly<{
  legalName: string; displayName: string; website: string; industry: string; sizeBand: string; description: string; save: string; readOnly: string;
}>;

const inputClass = "min-h-11 w-full rounded-md border border-input bg-background px-3 disabled:opacity-60";
const textareaClass = "min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 disabled:opacity-60";
const labelClass = "space-y-2 text-sm font-medium";

/**
 * The company page's two forms, plus the one writer control that fills both.
 *
 * The four public-copy values live here because they span two forms: the details
 * form writes the English description, the profile form writes the taglines and
 * the Chinese description. One generation fills all four, and neither form's save
 * is touched by it — the member still presses save, and review still governs
 * publication.
 */
export function CompanyForms({details, profile, writer}: Readonly<{
  details: Readonly<{values: CompanyDetailsValues; labels: CompanyDetailsLabels; action: ((formData: FormData) => void | Promise<void>) | undefined; canManage: boolean}>;
  profile: Readonly<{values: CompanyProfileValues; labels: CompanyProfileFormLabels; action: (state: CompanyProfileFormState, formData: FormData) => Promise<CompanyProfileFormState>; locale: AppLocale; readOnly: boolean; publicHref: string | null}>;
  writer: WriterAssistProps | null;
}>) {
  const [copy, setCopy] = useState({
    taglineEn: profile.values.taglineEn,
    taglineZhHk: profile.values.taglineZhHk,
    description: details.values.description,
    descriptionZhHk: profile.values.descriptionZhHk,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <form action={details.action} className="glass-card grid gap-5 p-5 sm:grid-cols-2 sm:p-8">
        <input name="companyId" type="hidden" value={details.values.companyId} />
        <label className={`${labelClass} sm:col-span-2`}>
          <span>{details.labels.legalName}</span>
          <input className={inputClass} defaultValue={details.values.legalName} disabled={!details.canManage} name="legalName" required />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          <span>{details.labels.displayName}</span>
          <input className={inputClass} defaultValue={details.values.displayName} disabled={!details.canManage} name="displayName" required />
        </label>
        <label className={labelClass}>
          <span>{details.labels.website}</span>
          <input className={inputClass} defaultValue={details.values.website} disabled={!details.canManage} name="website" type="url" />
        </label>
        <label className={labelClass}>
          <span>{details.labels.industry}</span>
          <input className={inputClass} defaultValue={details.values.industry} disabled={!details.canManage} name="industry" />
        </label>
        <label className={labelClass}>
          <span>{details.labels.sizeBand}</span>
          <input className={inputClass} defaultValue={details.values.sizeBand} disabled={!details.canManage} name="sizeBand" />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          <span>{details.labels.description}</span>
          <textarea
            className={textareaClass}
            disabled={!details.canManage}
            name="description"
            onChange={(event) => setCopy((current) => ({...current, description: event.target.value}))}
            value={copy.description}
          />
        </label>
        {details.canManage ? (
          <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground sm:col-span-2 sm:justify-self-start" type="submit">{details.labels.save}</button>
        ) : (
          <p className="text-sm text-muted-foreground sm:col-span-2">{details.labels.readOnly}</p>
        )}
      </form>

      {writer && !profile.readOnly ? (
        <WriterAssist
          kind="profile"
          labels={writer.labels}
          quotaLabel={writer.quotaLabel}
          exhausted={writer.exhausted}
          onGenerated={(generated) => setCopy((current) => ({
            taglineEn: generated.taglineEn ?? current.taglineEn,
            taglineZhHk: generated.taglineZhHk ?? current.taglineZhHk,
            description: generated.description ?? current.description,
            descriptionZhHk: generated.descriptionZhHk ?? current.descriptionZhHk,
          }))}
        />
      ) : null}

      <CompanyProfileForm
        action={profile.action}
        labels={profile.labels}
        locale={profile.locale}
        publicHref={profile.publicHref}
        readOnly={profile.readOnly}
        values={{...profile.values, taglineEn: copy.taglineEn, taglineZhHk: copy.taglineZhHk, descriptionZhHk: copy.descriptionZhHk}}
      />
    </div>
  );
}
