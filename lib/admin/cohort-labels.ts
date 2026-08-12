import type {CohortFormActionMessages} from "@/lib/admin/cohort-actions";

/**
 * The create page and the edit page render the same form, so their labels and
 * their error messages are built here once. A drift between the two would show
 * as a field that is translated on one screen and raw on the other.
 */
type Translator = (key: string) => string;

export function cohortFormLabels(t: Translator) {
  return {
    slug: t("manage.slug"),
    nameEn: t("manage.nameEn"),
    nameZhHk: t("manage.nameZhHk"),
    descriptionEn: t("manage.descriptionEn"),
    descriptionZhHk: t("manage.descriptionZhHk"),
    track: t("manage.track"),
    startsOn: t("manage.startsOn"),
    endsOn: t("manage.endsOn"),
    endsOnHelp: t("manage.endsOnHelp"),
    capacity: t("manage.capacity"),
    feeHkd: t("manage.feeHkd"),
    feeHelp: t("manage.feeHelp"),
    status: t("manage.status"),
    statusHelp: t("manage.statusHelp"),
    statuses: {
      planning: t("manage.statuses.planning"),
      open: t("manage.statuses.open"),
      active: t("manage.statuses.active"),
      completed: t("manage.statuses.completed"),
      archived: t("manage.statuses.archived"),
    },
  };
}

export function cohortFormMessages(t: Translator): CohortFormActionMessages {
  return {
    successMessage: t("manage.success"),
    validationMessage: t("manage.validation"),
    slugConflictMessage: t("manage.slugConflict"),
    endBeforeStartMessage: t("manage.endBeforeStart"),
    errorMessage: t("manage.error"),
  };
}
