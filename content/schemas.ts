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

export const newsPostSchema = z.object({
  slug,
  publishedAt: z.string().datetime(),
  image: z.string().startsWith('/'),
  namespace: z.string().min(1)
});

export const programSchema = z.object({
  id: z.enum(['cpai', 'hkict', 'tct', 'asa']),
  namespace: z.string().min(1),
  image: z.string().startsWith('/')
});

export type EventRecord = z.infer<typeof eventSchema>;
export type NewsPostRecord = z.infer<typeof newsPostSchema>;
export type ProgramRecord = z.infer<typeof programSchema>;
