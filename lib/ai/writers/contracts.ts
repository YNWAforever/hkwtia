import {z} from "zod";

/** The three surfaces a member can ask a writer to fill. */
export const WRITER_KINDS = ["profile", "listing", "event"] as const;
export type WriterKind = (typeof WRITER_KINDS)[number];

const htmlPattern = /<\s*\/?\s*[a-z][^>]*>/i;

/**
 * The receiving bounds, per surface. These mirror the receiving
 * repositories/contracts — a company profile tagline is 160 while a showcase
 * listing tagline is 240 — not the form inputs, which carry no `maxLength` on
 * several of these fields. `config/agents/writer.ts` tells the model the same
 * numbers, so a prompt and its schema cannot drift; an over-long field rejects
 * the whole response and still spends a quota unit.
 */
export const WRITER_BOUNDS = Object.freeze({
  profile: Object.freeze({taglineMax: 160, descriptionMax: 2_000}),
  listing: Object.freeze({taglineMax: 240, descriptionMax: 2_000}),
  event: Object.freeze({taglineMax: null, descriptionMax: 2_000}),
} as const satisfies Readonly<Record<WriterKind, {taglineMax: number | null; descriptionMax: number}>>);

/**
 * One copy field. HTML is refused for the same reason `draft-email` refuses it:
 * the copy is plain text.
 */
const copyText = (max: number) =>
  z.string().trim().min(1).max(max).refine((value) => !htmlPattern.test(value), "HTML is not allowed");

export const writerOutputSchema = {
  profile: z.object({
    taglineEn: copyText(WRITER_BOUNDS.profile.taglineMax),
    taglineZhHk: copyText(WRITER_BOUNDS.profile.taglineMax),
    description: copyText(WRITER_BOUNDS.profile.descriptionMax),
    descriptionZhHk: copyText(WRITER_BOUNDS.profile.descriptionMax),
  }).strict(),
  listing: z.object({
    taglineEn: copyText(WRITER_BOUNDS.listing.taglineMax),
    taglineZhHk: copyText(WRITER_BOUNDS.listing.taglineMax),
    descriptionEn: copyText(WRITER_BOUNDS.listing.descriptionMax),
    descriptionZhHk: copyText(WRITER_BOUNDS.listing.descriptionMax),
  }).strict(),
  event: z.object({
    descriptionEn: copyText(WRITER_BOUNDS.event.descriptionMax),
    descriptionZh: copyText(WRITER_BOUNDS.event.descriptionMax),
  }).strict(),
} as const satisfies Readonly<Record<WriterKind, z.ZodTypeAny>>;

export type WriterOutput = {
  profile: z.infer<typeof writerOutputSchema.profile>;
  listing: z.infer<typeof writerOutputSchema.listing>;
  event: z.infer<typeof writerOutputSchema.event>;
};

export const writerBriefSchema = z.object({
  kind: z.enum(WRITER_KINDS),
  brief: z.string().trim().min(1).max(2000),
}).strict();

export type WriterBrief = z.infer<typeof writerBriefSchema>;
