import {formatHongKongDateTimeLocal, parseHongKongDateTimeLocal} from "@/lib/admin/event-form-input";
import type {MemberEventInput, MemberEventRow} from "@/lib/db/repos/events";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optional(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value.length > 0 ? value : null;
}

/**
 * FormData → repository input. Dates are Hong Kong wall-clock `datetime-local`
 * values (same parser as the admin form); an unparseable one throws a
 * `RangeError` that the action maps to the generic INVALID message. Unknown
 * select values fall back to the safe member defaults rather than reaching the
 * repository, whose schema would reject `invite_only`/`ticketed` anyway.
 */
export function memberEventInputFromFormData(formData: FormData): MemberEventInput {
  const capacity = optional(formData, "capacity");
  const endsAt = optional(formData, "endsAt");
  const format = text(formData, "format");
  const visibility = text(formData, "visibility");
  const registrationMode = text(formData, "registrationMode");
  return {
    slug: text(formData, "slug"),
    titleEn: text(formData, "titleEn"),
    titleZh: optional(formData, "titleZh"),
    descriptionEn: text(formData, "descriptionEn"),
    descriptionZh: optional(formData, "descriptionZh"),
    startsAt: parseHongKongDateTimeLocal(text(formData, "startsAt")),
    endsAt: endsAt ? parseHongKongDateTimeLocal(endsAt) : null,
    venue: optional(formData, "venue"),
    capacity: capacity ? Number(capacity) : null,
    format: format === "online" || format === "hybrid" ? format : "in_person",
    onlineUrl: optional(formData, "onlineUrl"),
    visibility: visibility === "members_only" ? "members_only" : "public",
    registrationMode: registrationMode === "external" ? "external" : "rsvp",
    externalRegistrationUrl: optional(formData, "externalRegistrationUrl"),
    // De-duplicated: "ai, health, ai" would otherwise store the tag twice.
    tags: [...new Set(text(formData, "tags").split(",").map((tag) => tag.trim()).filter((tag) => tag.length > 0))],
    heroMediaId: optional(formData, "heroMediaId"),
  };
}

/** Form defaults: every field a string so `defaultValue` never sees `null`. */
export type MemberEventView = Readonly<{
  id: string; slug: string; titleEn: string; titleZh: string; descriptionEn: string; descriptionZh: string;
  startsAtLocal: string; endsAtLocal: string; venue: string; capacity: string; status: MemberEventRow["status"]; visibility: string;
  format: string; onlineUrl: string; registrationMode: string; externalRegistrationUrl: string; tags: string;
  heroMediaId: string; rejectionReason: string | null; submittedAt: string | null; publishedAt: string | null;
}>;

// The row schema coerces timestamps to `Date`, but a row that crossed a
// serialisation boundary (a cached RSC payload, a test fixture) carries ISO
// strings; `new Date(value)` accepts both, so the view never depends on which.
const asDate = (value: Date | string | null): Date | null => (value === null ? null : new Date(value));
const asDateLocal = (value: Date | string | null): string => formatHongKongDateTimeLocal(asDate(value));
const asIso = (value: Date | string | null): string | null => asDate(value)?.toISOString() ?? null;

/** Snake-case repository row → form defaults. */
export function memberEventViewFromRow(row: MemberEventRow): MemberEventView {
  return {
    id: row.id, slug: row.slug, titleEn: row.title_en, titleZh: row.title_zh ?? "",
    descriptionEn: row.description_en, descriptionZh: row.description_zh ?? "",
    startsAtLocal: asDateLocal(row.starts_at), endsAtLocal: asDateLocal(row.ends_at), venue: row.venue ?? "",
    capacity: row.capacity === null ? "" : String(row.capacity),
    status: row.status, visibility: row.visibility, format: row.format,
    onlineUrl: row.online_url ?? "", registrationMode: row.registration_mode,
    externalRegistrationUrl: row.external_registration_url ?? "",
    tags: row.tags.join(", "),
    heroMediaId: row.hero_media_id ?? "", rejectionReason: row.rejection_reason,
    submittedAt: asIso(row.submitted_at),
    publishedAt: asIso(row.published_at),
  };
}
