"use client";

import {PrivateLink as Link} from "@/components/internal-shell/private-link";
import {useActionState, useState} from "react";

import {PortalImageField, type PortalImageFieldLabels} from "@/components/portal/forms/image-field";
import {PortalTagPicker} from "@/components/portal/forms/tag-picker";
import {StatusLabel} from "@/components/wt/status-label";
import {INDUSTRY_TAGS, industryTagLabel} from "@/config/industry-tags";
import type {AppLocale} from "@/i18n/routing";
import type {CompanyProfileFormState} from "@/lib/portal/company-profile-actions";

export type CompanyProfileStatus = "hidden" | "pending_review" | "published" | "rejected";

export type CompanyProfileValues = Readonly<{
  slug: string; taglineEn: string; taglineZhHk: string; descriptionZhHk: string; website: string;
  logoMediaId: string; tags: readonly string[]; status: CompanyProfileStatus; rejectionReason: string | null;
}>;

export type CompanyProfileFormLabels = Readonly<{
  fields: Readonly<{slug: string; taglineEn: string; taglineZhHk: string; descriptionZhHk: string; website: string; tags: string}>;
  groups: Readonly<{address: string; tagline: string; description: string}>;
  logo: PortalImageFieldLabels;
  /** The raw ICU text ("{count} / {max} selected"); this client component fills it in. */
  tagCounter: string;
  statusLabel: Readonly<Record<CompanyProfileStatus, string>>;
  reviewNotice: string;
  rejected: string | null;
  saveDraft: string; submitForReview: string; saved: string; submitted: string; readOnly: string;
  /** The single action on a Live / Under review page, and the line under it saying where a save goes. */
  saveChanges: string; saveSendsForReview: string;
  /** Why "Submit for review" is unavailable while the page address is empty. */
  needsAddress: string;
  viewPublic: string;
  errors: Readonly<Record<string, string>>;
}>;

type Action = (state: CompanyProfileFormState, formData: FormData) => Promise<CompanyProfileFormState>;

const initial: CompanyProfileFormState = {status: "idle"};
const TAG_LIMIT = 8;

/**
 * Programme B-7. Two submit buttons share one form and one action: the
 * submitter's `intent` (React sends the clicked button's name/value in the
 * FormData) tells the action whether to stop at a save or follow it with
 * "publish my profile", so there is a single action state and a failed
 * submission can never read as a failed save — the shape `EventForm` uses.
 *
 * Publish is offered only from `hidden` and `rejected`; a live page is demoted
 * to `pending_review` by editing it (`reviewNotice` says so up front).
 *
 * On a Live or Under review page there is nothing to submit, so the form offers one primary
 * "Save changes" (still `intent=save`) with a line saying the save goes to WTIA review, rather
 * than a greyed "Submit for review" beside a "Save draft" that would quietly take the page off
 * the directory (final review, Important 1).
 *
 * The logo is a media id the member never sees: `PortalImageField` submits it
 * as the hidden `logoMediaId` and shows a preview and an upload instead.
 */
export function CompanyProfileForm({values, labels, action, locale, readOnly, publicHref}: Readonly<{
  values: CompanyProfileValues; labels: CompanyProfileFormLabels; action: Action; locale: AppLocale;
  readOnly: boolean; publicHref: string | null;
}>) {
  const [state, dispatch, pending] = useActionState(action, initial);
  const [slug, setSlug] = useState(values.slug);
  const inReview = values.status === "published" || values.status === "pending_review";
  const hasAddress = slug.trim().length > 0;
  const canPublish = !readOnly && hasAddress && !inReview;
  const tagOptions = INDUSTRY_TAGS.map((tag) => ({value: tag.slug, label: industryTagLabel(tag.slug, locale)}));
  return (
    <form action={dispatch} className="portal-form" noValidate>
      <div className="portal-form-status">
        <p className="portal-form-message" role="status">
          <StatusLabel>{labels.statusLabel[values.status]}</StatusLabel>
          {/* Already localized by the page with `localizedPath`; this component never builds a prefix. */}
          {publicHref ? <Link className="text-link" href={publicHref}>{labels.viewPublic}</Link> : null}
        </p>
        {/* Only someone who can edit can send the page back to review; a read-only member would read it as a warning about nothing. */}
        {readOnly ? null : <p className="portal-field-help">{labels.reviewNotice}</p>}
        {/* Body text, not the 11px eyebrow: the reason is free text the member has to read and act on. */}
        {labels.rejected ? <p className="portal-form-alert" role="alert">{labels.rejected}</p> : null}
      </div>
      <fieldset className="portal-fieldset">
        <legend className="portal-fieldset-title">{labels.groups.address}</legend>
        <div className="portal-pair">
          <div className="portal-field">
            <label htmlFor="company-slug">{labels.fields.slug}</label>
            <input disabled={readOnly} id="company-slug" name="slug" onChange={(event) => setSlug(event.target.value)} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" type="text" value={slug} />
          </div>
          <div className="portal-field">
            <label htmlFor="company-website">{labels.fields.website}</label>
            <input defaultValue={values.website} disabled={readOnly} id="company-website" name="website" type="url" />
          </div>
        </div>
      </fieldset>
      <fieldset className="portal-fieldset">
        <legend className="portal-fieldset-title">{labels.groups.tagline}</legend>
        <div className="portal-pair">
          <div className="portal-field">
            <label htmlFor="company-taglineEn">{labels.fields.taglineEn}</label>
            <input defaultValue={values.taglineEn} disabled={readOnly} id="company-taglineEn" maxLength={160} name="taglineEn" type="text" />
          </div>
          <div className="portal-field">
            <label htmlFor="company-taglineZhHk">{labels.fields.taglineZhHk}</label>
            <input defaultValue={values.taglineZhHk} disabled={readOnly} id="company-taglineZhHk" maxLength={160} name="taglineZhHk" type="text" />
          </div>
        </div>
      </fieldset>
      <fieldset className="portal-fieldset">
        <legend className="portal-fieldset-title">{labels.groups.description}</legend>
        <div className="portal-field">
          <label htmlFor="company-descriptionZhHk">{labels.fields.descriptionZhHk}</label>
          <textarea defaultValue={values.descriptionZhHk} disabled={readOnly} id="company-descriptionZhHk" maxLength={2000} name="descriptionZhHk" />
        </div>
      </fieldset>
      <PortalTagPicker
        counterLabel={(count, max) => labels.tagCounter.replace("{count}", String(count)).replace("{max}", String(max))}
        initial={values.tags}
        legend={labels.fields.tags}
        max={TAG_LIMIT}
        name="tags"
        options={tagOptions}
        readOnly={readOnly}
      />
      <PortalImageField initialValue={values.logoMediaId} labels={labels.logo} name="logoMediaId" readOnly={readOnly} store="id" />
      {state.status === "error" ? <p className="portal-form-alert" role="alert">{labels.errors[state.code ?? "INVALID"] ?? labels.errors.INVALID}</p> : null}
      {state.status === "saved" || state.status === "submitted" ? <p className="portal-form-message" role="status"><StatusLabel>{state.status === "submitted" ? labels.submitted : labels.saved}</StatusLabel></p> : null}
      {readOnly ? <p className="portal-readonly-note">{labels.readOnly}</p> : inReview ? (
        <div className="portal-form-actions">
          <p className="portal-field-help portal-actions-note" id="company-save-note">{labels.saveSendsForReview}</p>
          <button aria-describedby="company-save-note" className="button" disabled={pending} name="intent" type="submit" value="save">{labels.saveChanges}</button>
        </div>
      ) : (
        <div className="portal-form-actions">
          {hasAddress ? null : <p className="portal-field-help portal-actions-note" id="company-publish-note">{labels.needsAddress}</p>}
          <button className="portal-button-outline" disabled={pending} formAction={dispatch} name="intent" type="submit" value="save">{labels.saveDraft}</button>
          <button aria-describedby={hasAddress ? undefined : "company-publish-note"} className="button" disabled={pending || !canPublish} name="intent" type="submit" value="publish">{labels.submitForReview}</button>
        </div>
      )}
    </form>
  );
}
