import {z} from "zod";

const hongKongLocalPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const hongKongFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Hong_Kong",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatHongKongDateTimeLocal(value: Date | null | undefined): string {
  if (!value) return "";
  const parts = Object.fromEntries(hongKongFormatter.formatToParts(value).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function parseHongKongDateTimeLocal(value: string): Date {
  const match = hongKongLocalPattern.exec(value);
  if (!match) throw new RangeError("invalid Hong Kong datetime-local value");
  const [, year, month, day, hour, minute] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 8, Number(minute)));
  if (formatHongKongDateTimeLocal(parsed) !== value) throw new RangeError("invalid Hong Kong datetime-local value");
  return parsed;
}

function formDate(formData: FormData, name: "startsAt" | "endsAt", optional = false): Date | null {
  const value = String(formData.get(name) ?? "").trim();
  if (optional && !value) return null;
  try {
    return parseHongKongDateTimeLocal(value);
  } catch {
    throw new z.ZodError([{code: z.ZodIssueCode.custom, path: [name], message: "invalid Hong Kong datetime"}]);
  }
}

export function eventFormInput(formData: FormData) {
  const capacity = String(formData.get("capacity") ?? "").trim();
  const optional = (name: string) => String(formData.get(name) ?? "").trim() || null;
  return {
    slug: formData.get("slug"),
    titleEn: formData.get("titleEn"),
    titleZh: optional("titleZh"),
    descriptionEn: formData.get("descriptionEn"),
    descriptionZh: optional("descriptionZh"),
    startsAt: formDate(formData, "startsAt"),
    endsAt: formDate(formData, "endsAt", true),
    venue: optional("venue"),
    capacity: capacity ? Number(capacity) : null,
    memberOnly: formData.get("memberOnly") === "on",
    published: formData.get("published") === "on",
  };
}