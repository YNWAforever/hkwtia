import type {EventFormLabels, SubmitBlockedReason} from "@/components/portal/event-form";

// Not a route file: Next only treats the convention names (page, layout, …)
// as routes, so this helper can live beside the pages that share it.
type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * Labels for `EventForm`, read from the `Portal.memberEvents` namespace (`t`) and the shared
 * form strings in `Portal.forms` (`tForms`). `pageAddressHelp` is formatted with the literal
 * `{path}` as its value, so the placeholder survives for the client form to fill in as the
 * member types.
 */
export function eventFormLabels(t: Translate, tForms: Translate): EventFormLabels {
  return {
    pageAddress: t("fields.slug"), pageAddressHelp: t("pageAddressHelp", {path: "{path}"}),
    titleEn: t("fields.titleEn"), titleZh: t("fields.titleZh"), descriptionEn: t("fields.descriptionEn"), descriptionZh: t("fields.descriptionZh"),
    startsAt: t("fields.startsAt"), endsAt: t("fields.endsAt"), venue: t("fields.venue"), capacity: t("fields.capacity"), format: t("fields.format"),
    formats: {in_person: t("formats.in_person"), online: t("formats.online"), hybrid: t("formats.hybrid")},
    onlineUrl: t("fields.onlineUrl"), visibility: t("fields.visibility"), visibilities: {public: t("visibilities.public"), members_only: t("visibilities.members_only")},
    registrationMode: t("fields.registrationMode"), registrationModes: {rsvp: t("registrationModes.rsvp"), external: t("registrationModes.external")},
    externalRegistrationUrl: t("fields.externalRegistrationUrl"), tags: t("fields.tags"), tagsHelp: tForms("commaHelp"),
    groups: {basics: t("groups.basics"), description: t("groups.description"), whenWhere: t("groups.whenWhere"), registration: t("groups.registration"), imageTags: t("groups.imageTags")},
    image: {
      label: t("fields.heroImage"), help: t("fields.heroHelp"), empty: t("image.empty"), previewAlt: t("image.previewAlt"),
      external: tForms("image.external"), remove: tForms("image.remove"),
      upload: {choose: t("hero.choose"), alt: t("hero.alt"), upload: t("hero.upload"), uploading: t("hero.uploading"), done: t("hero.done"), failed: t("hero.failed")},
    },
    saveDraft: t("saveDraft"), submit: t("submit"), saving: t("saving"), submitUnavailable: t("submitUnavailable"), submitNotIncluded: t("submitNotIncluded"),
    errors: {
      INVALID: t("errors.INVALID"), EVENT_SLUG_TAKEN: t("errors.EVENT_SLUG_TAKEN"), EVENT_QUOTA_EXCEEDED: t("errors.EVENT_QUOTA_EXCEEDED"),
      EVENT_PUBLISHING_NOT_INCLUDED: t("errors.EVENT_PUBLISHING_NOT_INCLUDED"), EVENT_NOT_EDITABLE: t("errors.EVENT_NOT_EDITABLE"),
      EVENT_HERO_MEDIA_INVALID: t("errors.EVENT_HERO_MEDIA_INVALID"), NO_MANAGED_COMPANY: t("errors.NO_MANAGED_COMPANY"),
      NO_MEMBERSHIP_FOR_COMPANY: t("errors.NO_MEMBERSHIP_FOR_COMPANY"), FORBIDDEN: t("errors.FORBIDDEN"),
    },
  };
}

/**
 * Why a member cannot submit for review, from the publishing context the page loaded. `canPublish`
 * is `limit > 0 && used < limit`, so a zero limit means the plan has no event publishing at all,
 * which "no reviewed events left this quarter" misdescribed. No context (an inactive membership)
 * returns null: the page's own alert already says why, and a quota line would contradict it.
 */
export function submitBlockedReason(context: Readonly<{canPublish: boolean; limit: number}> | null): SubmitBlockedReason | null {
  if (!context || context.canPublish) return null;
  return context.limit > 0 ? "quota" : "plan";
}
