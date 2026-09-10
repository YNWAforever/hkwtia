"use client";

import Link from "next/link";
import {useActionState, useState} from "react";

import {HeroUpload, type HeroUploadLabels} from "@/components/portal/hero-upload";
import {INDUSTRY_TAGS, industryTagLabel} from "@/config/industry-tags";
import type {AppLocale} from "@/i18n/routing";
import type {CompanyProfileFormState} from "@/lib/portal/company-profile-actions";

export type CompanyProfileStatus = "hidden" | "pending_review" | "published" | "rejected";

export type CompanyProfileValues = Readonly<{
  slug: string; taglineEn: string; taglineZhHk: string; descriptionZhHk: string; website: string;
  logoMediaId: string; tags: readonly string[]; status: CompanyProfileStatus; rejectionReason: string | null;
}>;

export type CompanyProfileFormLabels = Readonly<{
  fields: Readonly<{slug: string; taglineEn: string; taglineZhHk: string; descriptionZhHk: string; website: string; tags: string; logoMediaId: string}>;
  logo: HeroUploadLabels;
  status: Readonly<Record<CompanyProfileStatus, string>>;
  statusLabel: string;
  reviewNotice: string;
  rejected: string | null;
  save: string; publish: string; saved: string; submitted: string; readOnly: string;
  viewPublic: string;
  errors: Readonly<Record<string, string>>;
}>;

type Action = (state: CompanyProfileFormState, formData: FormData) => Promise<CompanyProfileFormState>;

const initial: CompanyProfileFormState = {status: "idle"};
const inputClass = "min-h-11 w-full rounded-md border border-input bg-background px-3 disabled:opacity-60";
const textareaClass = "min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 disabled:opacity-60";
const labelClass = "space-y-2 text-sm font-medium";

/**
 * Programme B-7. Two submit buttons share one form and one action: the
 * submitter's `intent` (React sends the clicked button's name/value in the
 * FormData) tells the action whether to stop at a save or follow it with
 * "publish my profile", so there is a single action state and a failed
 * submission can never read as a failed save — the shape `EventForm` uses.
 *
 * Publish is offered only from `hidden` and `rejected`. A live page is not
 * re-submitted from here: editing it demotes it to `pending_review` on its own
 * (`companyProfilesRepository.updateProfile`, and `reviewResetFor` in
 * `lib/db/repos/companies.ts` for the company-details form above), which is
 * what `reviewNotice` tells the member before they touch a field.
 *
 * The logo field is a media id: it stays a visible, editable input so a member
 * can clear it or paste an id from an earlier upload, and `HeroUpload` beneath
 * it fills it in after a successful post to /api/portal/media/upload.
 */
export function CompanyProfileForm({values, labels, action, locale, readOnly, publicHref}: Readonly<{
  values: CompanyProfileValues; labels: CompanyProfileFormLabels; action: Action; locale: AppLocale;
  readOnly: boolean; publicHref: string | null;
}>) {
  const [state, dispatch, pending] = useActionState(action, initial);
  const [logoMediaId, setLogoMediaId] = useState(values.logoMediaId);
  const [slug, setSlug] = useState(values.slug);
  const canPublish = !readOnly && slug.trim().length > 0 && (values.status === "hidden" || values.status === "rejected");
  return (
    <form action={dispatch} className="glass-card grid gap-5 p-5 sm:grid-cols-2 sm:p-8" noValidate>
      <div className="space-y-2 sm:col-span-2">
        <p className="text-sm" role="status">
          <span className="font-medium">{labels.statusLabel}:</span> {labels.status[values.status]}
          {/* Already localized by the page with `localizedPath`; this component never builds a prefix. */}
          {publicHref ? <> · <Link className="font-medium underline underline-offset-4" href={publicHref}>{labels.viewPublic}</Link></> : null}
        </p>
        <p className="text-sm text-muted-foreground">{labels.reviewNotice}</p>
        {labels.rejected ? <p className="text-sm text-destructive" role="alert">{labels.rejected}</p> : null}
      </div>
      <label className={labelClass}>
        <span>{labels.fields.slug}</span>
        <input className={inputClass} disabled={readOnly} name="slug" onChange={(event) => setSlug(event.target.value)} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" type="text" value={slug} />
      </label>
      <label className={labelClass}>
        <span>{labels.fields.website}</span>
        <input className={inputClass} defaultValue={values.website} disabled={readOnly} name="website" type="url" />
      </label>
      <label className={labelClass}>
        <span>{labels.fields.taglineEn}</span>
        <input className={inputClass} defaultValue={values.taglineEn} disabled={readOnly} maxLength={160} name="taglineEn" type="text" />
      </label>
      <label className={labelClass}>
        <span>{labels.fields.taglineZhHk}</span>
        <input className={inputClass} defaultValue={values.taglineZhHk} disabled={readOnly} maxLength={160} name="taglineZhHk" type="text" />
      </label>
      <label className={`${labelClass} sm:col-span-2`}>
        <span>{labels.fields.descriptionZhHk}</span>
        <textarea className={textareaClass} defaultValue={values.descriptionZhHk} disabled={readOnly} maxLength={2000} name="descriptionZhHk" />
      </label>
      <fieldset className="space-y-3 text-sm sm:col-span-2" disabled={readOnly}>
        <legend className="font-medium">{labels.fields.tags}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {INDUSTRY_TAGS.map((tag) => (
            <label className="flex items-center gap-2 font-normal" key={tag.slug}>
              <input defaultChecked={values.tags.includes(tag.slug)} name="tags" type="checkbox" value={tag.slug} />
              <span>{industryTagLabel(tag.slug, locale)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className={`${labelClass} sm:col-span-2`}>
        <span>{labels.fields.logoMediaId}</span>
        <input className={inputClass} disabled={readOnly} name="logoMediaId" onChange={(event) => setLogoMediaId(event.target.value)} type="text" value={logoMediaId} />
      </label>
      {readOnly ? null : <HeroUpload labels={labels.logo} onUploaded={setLogoMediaId} />}
      {state.status === "error" ? <p className="text-sm text-destructive sm:col-span-2" role="alert">{labels.errors[state.code ?? "INVALID"] ?? labels.errors.INVALID}</p> : null}
      {state.status === "saved" || state.status === "submitted" ? <p className="text-sm text-muted-foreground sm:col-span-2" role="status">{state.status === "submitted" ? labels.submitted : labels.saved}</p> : null}
      {readOnly ? <p className="text-sm text-muted-foreground sm:col-span-2">{labels.readOnly}</p> : (
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <button className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium disabled:opacity-60" disabled={pending} formAction={dispatch} name="intent" type="submit" value="save">{labels.save}</button>
          <button className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60" disabled={pending || !canPublish} name="intent" type="submit" value="publish">{labels.publish}</button>
        </div>
      )}
    </form>
  );
}
