import {z} from "zod";

import {publicRoutes, type PublicRoute} from "@/config/public-routes";

const canonicalHref = z.custom<PublicRoute>(
  (value) => typeof value === "string" && publicRoutes.includes(value as PublicRoute),
  "Announcement href must be a canonical public route",
);

function trimmedUnicodeText(maximum: number) {
  return z.string().transform((value) => value.trim()).superRefine((value, context) => {
    const length = Array.from(value).length;
    if (length < 1 || length > maximum) {
      context.addIssue({code: z.ZodIssueCode.custom, message: "Invalid announcement text length"});
    }
  });
}

const announcementSchema = z.object({
  id: z.string().trim().min(1).max(80),
  startsAt: z.string().datetime({offset: true}),
  endsAt: z.string().datetime({offset: true}),
  href: canonicalHref,
  text: z.object({
    en: trimmedUnicodeText(180),
    "zh-HK": trimmedUnicodeText(180),
  }).strict(),
}).strict();

export type ActiveAnnouncement = Readonly<z.infer<typeof announcementSchema>>;

const persistedAnnouncementSchema = z.object({
  id: z.string().uuid(),
  titleEn: trimmedUnicodeText(180),
  titleZhHk: trimmedUnicodeText(180),
  ctaLabelEn: trimmedUnicodeText(60),
  ctaLabelZhHk: trimmedUnicodeText(60),
  href: canonicalHref,
  startsAt: z.date(),
  endsAt: z.date(),
  priority: z.number().int().min(0).max(1000),
});

export type ScheduledAnnouncementProjection = Readonly<{
  id: string;
  title: Readonly<{en: string; "zh-HK": string}>;
  ctaLabel: Readonly<{en: string; "zh-HK": string}>;
  href: PublicRoute;
  startsAt: string;
  endsAt: string;
  priority: number;
}>;

/** Display-safe shape for the later public-layout cutover; lifecycle fields stay private. */
export function projectPersistedAnnouncement(value: unknown): ScheduledAnnouncementProjection {
  const row = persistedAnnouncementSchema.parse(value);
  return {
    id: row.id,
    title: {en: row.titleEn, "zh-HK": row.titleZhHk},
    ctaLabel: {en: row.ctaLabelEn, "zh-HK": row.ctaLabelZhHk},
    href: row.href,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    priority: row.priority,
  };
}

export function resolveAnnouncement(value: unknown, now: Date): ActiveAnnouncement | null {
  const parsed = announcementSchema.safeParse(value);
  const nowMs = now.getTime();
  if (!parsed.success || !Number.isFinite(nowMs)) return null;

  const startsAt = Date.parse(parsed.data.startsAt);
  const endsAt = Date.parse(parsed.data.endsAt);
  if (endsAt <= startsAt || nowMs < startsAt || nowMs >= endsAt) return null;
  return parsed.data;
}
