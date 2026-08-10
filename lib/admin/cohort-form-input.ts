/**
 * Pure FormData → domain input. Kept free of `server-only` so the client form
 * can share the field contract.
 */
function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/**
 * An optional date arrives as "" from an untouched `<input type="date">`, which
 * is not the same as an absent end date. Normalising it to null here keeps the
 * "runs until further notice" case expressible and stops "" reaching a `date`
 * column.
 */
function optionalDate(formData: FormData, name: string): string | null {
  const value = text(formData, name);
  return value === "" ? null : value;
}

export const cohortFormFields = [
  "slug", "nameEn", "nameZhHk", "descriptionEn", "descriptionZhHk",
  "track", "startsOn", "endsOn", "capacity", "feeHkd", "status",
] as const;

export function cohortFormInput(formData: FormData): Readonly<Record<string, unknown>> {
  return {
    slug: text(formData, "slug"),
    nameEn: text(formData, "nameEn"),
    nameZhHk: text(formData, "nameZhHk"),
    descriptionEn: text(formData, "descriptionEn"),
    descriptionZhHk: text(formData, "descriptionZhHk"),
    track: text(formData, "track"),
    startsOn: text(formData, "startsOn"),
    endsOn: optionalDate(formData, "endsOn"),
    // Left as strings: the repository schema coerces them, so a non-numeric
    // entry becomes a field error there rather than a silent NaN here.
    capacity: text(formData, "capacity"),
    feeHkd: text(formData, "feeHkd"),
    status: text(formData, "status"),
  };
}
