import {z} from "zod";

import {publicRoutes, type PublicRoute} from "@/config/public-routes";

const canonicalHref = z.custom<PublicRoute>(
  (value) => typeof value === "string" && publicRoutes.includes(value as PublicRoute),
  "Announcement href must be a canonical public route",
);

const announcementSchema = z.object({
  id: z.string().trim().min(1).max(80),
  startsAt: z.string().datetime({offset: true}),
  endsAt: z.string().datetime({offset: true}),
  href: canonicalHref,
  text: z.object({
    en: z.string().trim().min(1).max(180),
    "zh-HK": z.string().trim().min(1).max(180),
  }).strict(),
}).strict();

export type ActiveAnnouncement = Readonly<z.infer<typeof announcementSchema>>;

export function resolveAnnouncement(value: unknown, now: Date): ActiveAnnouncement | null {
  const parsed = announcementSchema.safeParse(value);
  const nowMs = now.getTime();
  if (!parsed.success || !Number.isFinite(nowMs)) return null;

  const startsAt = Date.parse(parsed.data.startsAt);
  const endsAt = Date.parse(parsed.data.endsAt);
  if (endsAt <= startsAt || nowMs < startsAt || nowMs >= endsAt) return null;
  return parsed.data;
}
