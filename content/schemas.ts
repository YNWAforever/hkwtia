import {z} from 'zod';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const eventSchema = z.object({
  slug,
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable(),
  venue: z.string().min(1),
  image: z.string().startsWith('/'),
  namespace: z.string().min(1)
});


export const programSchema = z.object({
  id: z.enum(['cpai', 'hkict', 'tct', 'asa']),
  namespace: z.string().min(1),
  image: z.string().startsWith('/')
});

export type EventRecord = z.infer<typeof eventSchema>;
export type ProgramRecord = z.infer<typeof programSchema>;

const milestoneImageSchema = z.object({
  // Own-origin under a dedicated prefix. The CSP is `img-src 'self' data:` and
  // next.config.ts declares no remotePatterns, so a remote src renders nothing.
  src: z.string().regex(/^\/images\/history\/[A-Za-z0-9._-]+$/),
  altEn: z.string().min(1),
  altZh: z.string().min(1)
});

export const milestoneSchema = z.object({
  slug,
  year: z.number().int().min(2001).max(2100),
  month: z.string().regex(/^(0[1-9]|1[0-2])$/),
  titleEn: z.string().min(1),
  titleZh: z.string().min(1),
  bodyEn: z.string().min(1),
  bodyZh: z.string().min(1),
  images: z.array(milestoneImageSchema),
  // The source URL. Task 9 maps these to redirect destinations, so the shape is
  // pinned rather than free text.
  legacyPath: z.string().regex(/^\/\d{4}\/\d{2}\/[a-z0-9-]+\/$/),
  // Frozen at extraction from the word-count threshold, never recomputed at
  // render time — otherwise a copy edit could move an entry between layouts and
  // change its URL.
  featured: z.boolean()
});

export type MilestoneRecord = z.infer<typeof milestoneSchema>;
