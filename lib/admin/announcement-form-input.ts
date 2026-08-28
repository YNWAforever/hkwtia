import {z} from "zod";

import {
  formatHongKongDateTimeLocal,
  parseHongKongDateTimeLocal,
} from "@/lib/admin/event-form-input";

export type AnnouncementFormInput = Readonly<{
  titleEn: string;
  titleZhHk: string;
  ctaLabelEn: string;
  ctaLabelZhHk: string;
  href: string;
  startsAt: Date;
  endsAt: Date;
  priority: number;
}>;

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function dateTime(formData: FormData, name: "startsAt" | "endsAt"): Date {
  try {
    return parseHongKongDateTimeLocal(text(formData, name));
  } catch {
    throw new z.ZodError([{
      code: z.ZodIssueCode.custom,
      path: [name],
      message: "ANNOUNCEMENT_DATETIME_INVALID",
    }]);
  }
}

function priority(formData: FormData): number {
  const value = text(formData, "priority");
  const parsed = Number(value);
  if (!value || !Number.isInteger(parsed)) {
    throw new z.ZodError([{
      code: z.ZodIssueCode.custom,
      path: ["priority"],
      message: "ANNOUNCEMENT_PRIORITY_INVALID",
    }]);
  }
  return parsed;
}

export function announcementFormInput(formData: FormData): AnnouncementFormInput {
  return {
    titleEn: text(formData, "titleEn"),
    titleZhHk: text(formData, "titleZhHk"),
    ctaLabelEn: text(formData, "ctaLabelEn"),
    ctaLabelZhHk: text(formData, "ctaLabelZhHk"),
    href: text(formData, "href"),
    startsAt: dateTime(formData, "startsAt"),
    endsAt: dateTime(formData, "endsAt"),
    priority: priority(formData),
  };
}

export const formatAnnouncementDateTime = formatHongKongDateTimeLocal;
