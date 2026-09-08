import type {EventFormLabels} from "@/components/portal/event-form";

// Not a route file: Next only treats the convention names (page, layout, …)
// as routes, so this helper can live beside the pages that share it.
type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Labels for `EventForm`, read from the `Portal.memberEvents` namespace. */
export function eventFormLabels(t: Translate): EventFormLabels {
  return {
    slug: t("fields.slug"), titleEn: t("fields.titleEn"), titleZh: t("fields.titleZh"), descriptionEn: t("fields.descriptionEn"), descriptionZh: t("fields.descriptionZh"),
    startsAt: t("fields.startsAt"), endsAt: t("fields.endsAt"), venue: t("fields.venue"), capacity: t("fields.capacity"), format: t("fields.format"),
    formats: {in_person: t("formats.in_person"), online: t("formats.online"), hybrid: t("formats.hybrid")},
    onlineUrl: t("fields.onlineUrl"), visibility: t("fields.visibility"), visibilities: {public: t("visibilities.public"), members_only: t("visibilities.members_only")},
    registrationMode: t("fields.registrationMode"), registrationModes: {rsvp: t("registrationModes.rsvp"), external: t("registrationModes.external")},
    externalRegistrationUrl: t("fields.externalRegistrationUrl"), tags: t("fields.tags"), heroMediaId: t("fields.heroMediaId"), heroHelp: t("fields.heroHelp"),
    hero: {choose: t("hero.choose"), alt: t("hero.alt"), upload: t("hero.upload"), uploading: t("hero.uploading"), done: t("hero.done"), failed: t("hero.failed")},
    saveDraft: t("saveDraft"), submit: t("submit"), saving: t("saving"),
    errors: {
      INVALID: t("errors.INVALID"), EVENT_SLUG_TAKEN: t("errors.EVENT_SLUG_TAKEN"), EVENT_QUOTA_EXCEEDED: t("errors.EVENT_QUOTA_EXCEEDED"),
      EVENT_PUBLISHING_NOT_INCLUDED: t("errors.EVENT_PUBLISHING_NOT_INCLUDED"), EVENT_NOT_EDITABLE: t("errors.EVENT_NOT_EDITABLE"),
      EVENT_HERO_MEDIA_INVALID: t("errors.EVENT_HERO_MEDIA_INVALID"), NO_MANAGED_COMPANY: t("errors.NO_MANAGED_COMPANY"),
      NO_MEMBERSHIP_FOR_COMPANY: t("errors.NO_MEMBERSHIP_FOR_COMPANY"), FORBIDDEN: t("errors.FORBIDDEN"),
    },
  };
}
