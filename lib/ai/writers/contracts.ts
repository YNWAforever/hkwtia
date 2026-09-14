import {z} from "zod";

/** The three surfaces a member can ask a writer to fill. */
export const WRITER_KINDS = ["profile", "listing", "event"] as const;
export type WriterKind = (typeof WRITER_KINDS)[number];

const htmlPattern = /<\s*\/?\s*[a-z][^>]*>/i;

/**
 * One copy field. Bounds mirror the form inputs (`maxLength`) so a generated
 * value can never be longer than the field that receives it, and HTML is refused
 * for the same reason `draft-email` refuses it: the copy is plain text.
 */
const copyText = (max: number) =>
  z.string().trim().min(1).max(max).refine((value) => !htmlPattern.test(value), "HTML is not allowed");

export const writerOutputSchema = {
  profile: z.object({
    taglineEn: copyText(160),
    taglineZhHk: copyText(160),
    description: copyText(2000),
    descriptionZhHk: copyText(2000),
  }).strict(),
  listing: z.object({
    taglineEn: copyText(160),
    taglineZhHk: copyText(160),
    descriptionEn: copyText(2000),
    descriptionZhHk: copyText(2000),
  }).strict(),
  event: z.object({
    descriptionEn: copyText(2000),
    descriptionZh: copyText(2000),
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
