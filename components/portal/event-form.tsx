"use client";

import {useActionState, useRef, useState, useSyncExternalStore, type ReactNode} from "react";

import {PortalImageField, type PortalImageFieldLabels} from "@/components/portal/forms/image-field";
import type {MemberEventFormState} from "@/lib/events/member-actions";
import type {MemberEventView} from "@/lib/events/member-contract";
import {slugFromTitle} from "@/lib/events/slug-from-title";

export type EventFormLabels = Readonly<{
  /** The `slug` field's label; `pageAddressHelp` is raw ICU text with a `{path}` this component fills in. */
  pageAddress: string; pageAddressHelp: string;
  titleEn: string; titleZh: string; descriptionEn: string; descriptionZh: string; startsAt: string; endsAt: string;
  venue: string; capacity: string; format: string; formats: Readonly<{in_person: string; online: string; hybrid: string}>;
  onlineUrl: string; visibility: string; visibilities: Readonly<{public: string; members_only: string}>;
  registrationMode: string; registrationModes: Readonly<{rsvp: string; external: string}>; externalRegistrationUrl: string;
  tags: string; tagsHelp: string;
  groups: Readonly<{basics: string; description: string; whenWhere: string; registration: string; imageTags: string}>;
  image: PortalImageFieldLabels;
  saveDraft: string; submit: string; saving: string;
  /** The one line shown in place of "Submit for review" when `canSubmit` is false. */
  submitUnavailable: string;
  errors: Readonly<Record<string, string>>;
}>;

type Action = (state: MemberEventFormState, formData: FormData) => Promise<MemberEventFormState>;
type TextField = Exclude<keyof MemberEventView, "status" | "rejectionReason" | "submittedAt" | "publishedAt">;

const initial: MemberEventFormState = {status: "idle"};
const SLUG_PATTERN = "[a-z0-9]+(?:-[a-z0-9]+)*";
// false in the server HTML and during hydration, true once React runs in the browser (the
// locale switcher's pattern; a setState in an effect would render the form twice).
const subscribeToHydration = () => () => {};
const clientHydrationSnapshot = () => true;
const serverHydrationSnapshot = () => false;

/**
 * Two submit buttons share one form and one action. Each click sets a hidden
 * `intent` input before React builds FormData, telling the action whether to save
 * a draft or submit for review. This keeps a single
 * action state and a failed submission can never read as a failed draft save.
 * `notice` is the post-redirect "saved" copy from the edit page; the form owns
 * it so it disappears the moment a later attempt fails. The hero field is a
 * media id the member never sees: `PortalImageField` submits it as the hidden
 * `heroMediaId`, shows a preview, and fills it in after a successful post to
 * /api/portal/media/upload (S-3). Where uploads are not allowed it is read-only,
 * but the stored id is still submitted so a save never drops the hero.
 *
 * Page address (`slug`): on a new event it follows the English title until the
 * member types in it; on an existing event it never changes by itself, because
 * the address is already public or under review.
 *
 * `onlineUrl` and `externalRegistrationUrl` only apply to some formats and modes.
 * Where they do not, they are hidden and disabled, so they are not submitted (the
 * parser treats both as optional). The hiding waits for hydration: with
 * JavaScript off the server HTML is the whole form, and a field hidden there
 * could never be revealed, so the server renders every field visible and enabled.
 */
export function EventForm({values, labels, action, canSubmit, canSaveDraft = true, canUploadHero, notice = null}: Readonly<{
  values: MemberEventView | null; labels: EventFormLabels; action: Action; canSubmit: boolean; canSaveDraft?: boolean; canUploadHero?: boolean; notice?: string | null;
}>) {
  const [state, dispatch, pending] = useActionState(action, initial);
  const hydrated = useSyncExternalStore(subscribeToHydration, clientHydrationSnapshot, serverHydrationSnapshot);
  const [format, setFormat] = useState(values?.format ?? "in_person");
  const [registrationMode, setRegistrationMode] = useState(values?.registrationMode ?? "rsvp");
  const [slug, setSlug] = useState(values?.slug ?? "");
  // An existing event's address is never rewritten from its title.
  const [slugFollowsTitle, setSlugFollowsTitle] = useState(values === null);
  const intentInput = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const markDirty = () => {if (formRef.current) formRef.current.dataset.dirty = "true";};
  const setIntent = (intent: "draft" | "submit") => {
    if (intentInput.current) intentInput.current.value = intent;
  };
  const showOnlineUrl = !hydrated || format === "online" || format === "hybrid";
  const showExternalUrl = !hydrated || registrationMode === "external";
  const canUpload = canUploadHero ?? (canSaveDraft || canSubmit);
  const [helpBefore, helpAfter = ""] = labels.pageAddressHelp.split("{path}");

  // `startsAt`/`endsAt` post under the parser's names while their defaults come
  // from the `*Local` view fields, hence the separate `name` argument.
  const field = (valueKey: TextField, label: string, type = "text", extra: Readonly<{name?: string; required?: boolean; min?: number; hidden?: boolean; describedBy?: string; help?: ReactNode}> = {}) => {
    const name = extra.name ?? valueKey;
    return (
      <div className="portal-field" hidden={extra.hidden}>
        <label htmlFor={`event-${name}`}>{label}</label>
        <input aria-describedby={extra.describedBy} defaultValue={values?.[valueKey] ?? ""} disabled={extra.hidden} id={`event-${name}`} min={extra.min} name={name} required={extra.required} type={type} />
        {extra.help}
      </div>
    );
  };
  const area = (valueKey: "descriptionEn" | "descriptionZh", label: string, required = false) => (
    <div className="portal-field">
      <label htmlFor={`event-${valueKey}`}>{label}</label>
      <textarea defaultValue={values?.[valueKey] ?? ""} id={`event-${valueKey}`} name={valueKey} required={required} />
    </div>
  );

  return (
    <form action={dispatch} className="portal-form" data-member-event-form noValidate onChange={markDirty} onInput={markDirty} ref={formRef}>
      <input name="intent" ref={intentInput} type="hidden" value="submit" readOnly />
      {notice && state.status !== "error" ? <p className="portal-form-message" role="status">{notice}</p> : null}
      {values ? <input name="eventId" type="hidden" value={values.id} /> : null}
      <fieldset className="portal-fieldset">
        <legend className="portal-fieldset-title">{labels.groups.basics}</legend>
        <div className="portal-pair">
          <div className="portal-field">
            <label htmlFor="event-titleEn">{labels.titleEn}</label>
            <input defaultValue={values?.titleEn ?? ""} id="event-titleEn" name="titleEn" onChange={(event) => {if (slugFollowsTitle) setSlug(slugFromTitle(event.target.value));}} required type="text" />
          </div>
          {field("titleZh", labels.titleZh)}
        </div>
        <div className="portal-field">
          <label htmlFor="event-slug">{labels.pageAddress}</label>
          <input aria-describedby="event-slug-help" id="event-slug" name="slug" onChange={(event) => {setSlug(event.target.value); setSlugFollowsTitle(false);}} pattern={SLUG_PATTERN} required type="text" value={slug} />
          <p className="portal-field-help" id="event-slug-help">{helpBefore}<code>{`/events/${slug || "…"}`}</code>{helpAfter}</p>
        </div>
      </fieldset>
      <fieldset className="portal-fieldset">
        <legend className="portal-fieldset-title">{labels.groups.description}</legend>
        {area("descriptionEn", labels.descriptionEn, true)}
        {area("descriptionZh", labels.descriptionZh)}
      </fieldset>
      <fieldset className="portal-fieldset">
        <legend className="portal-fieldset-title">{labels.groups.whenWhere}</legend>
        <div className="portal-pair">
          {field("startsAtLocal", labels.startsAt, "datetime-local", {name: "startsAt", required: true})}
          {field("endsAtLocal", labels.endsAt, "datetime-local", {name: "endsAt"})}
        </div>
        <div className="portal-pair">
          {field("venue", labels.venue)}
          {field("capacity", labels.capacity, "number", {min: 1})}
        </div>
        <div className="portal-pair">
          <div className="portal-field">
            <label htmlFor="event-format">{labels.format}</label>
            <select defaultValue={values?.format ?? "in_person"} id="event-format" name="format" onChange={(event) => setFormat(event.target.value)}>
              {(["in_person", "online", "hybrid"] as const).map((key) => <option key={key} value={key}>{labels.formats[key]}</option>)}
            </select>
          </div>
          {field("onlineUrl", labels.onlineUrl, "url", {hidden: !showOnlineUrl})}
        </div>
      </fieldset>
      <fieldset className="portal-fieldset">
        <legend className="portal-fieldset-title">{labels.groups.registration}</legend>
        <div className="portal-pair">
          <div className="portal-field">
            <label htmlFor="event-visibility">{labels.visibility}</label>
            <select defaultValue={values?.visibility ?? "public"} id="event-visibility" name="visibility">
              {(["public", "members_only"] as const).map((key) => <option key={key} value={key}>{labels.visibilities[key]}</option>)}
            </select>
          </div>
          <div className="portal-field">
            <label htmlFor="event-registrationMode">{labels.registrationMode}</label>
            <select defaultValue={values?.registrationMode ?? "rsvp"} id="event-registrationMode" name="registrationMode" onChange={(event) => setRegistrationMode(event.target.value)}>
              {(["rsvp", "external"] as const).map((key) => <option key={key} value={key}>{labels.registrationModes[key]}</option>)}
            </select>
          </div>
        </div>
        {field("externalRegistrationUrl", labels.externalRegistrationUrl, "url", {hidden: !showExternalUrl})}
      </fieldset>
      <fieldset className="portal-fieldset">
        <legend className="portal-fieldset-title">{labels.groups.imageTags}</legend>
        <PortalImageField initialValue={values?.heroMediaId ?? ""} labels={labels.image} name="heroMediaId" onChange={markDirty} readOnly={!canUpload} store="id" />
        {field("tags", labels.tags, "text", {describedBy: "event-tags-help", help: <p className="portal-field-help" id="event-tags-help">{labels.tagsHelp}</p>})}
      </fieldset>
      {state.status === "error" ? <p className="portal-form-alert" role="alert">{labels.errors[state.code ?? "INVALID"] ?? labels.errors.INVALID}</p> : null}
      {/* One primary per form: when submitting is unavailable, Save draft takes the primary style and
          the line above it says why, rather than a greyed "Submit for review" with no reason. */}
      <div className="portal-form-actions">
        {canSubmit ? null : <p className="portal-field-help portal-actions-note" id="event-submit-note">{labels.submitUnavailable}</p>}
        <button aria-describedby={canSubmit ? undefined : "event-submit-note"} className={canSubmit ? "portal-button-outline" : "button"} disabled={pending || !canSaveDraft} onClick={() => setIntent("draft")} type="submit">{pending ? labels.saving : labels.saveDraft}</button>
        {canSubmit ? <button className="button" disabled={pending} onClick={() => setIntent("submit")} type="submit">{pending ? labels.saving : labels.submit}</button> : null}
      </div>
    </form>
  );
}
