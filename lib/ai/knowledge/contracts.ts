import { z } from "zod";
/** Pure, version-pinned provenance contract shared by provider and server readers. */
export const knowledgeRefSchema = z
  .object({
    sourceId: z.string().uuid(),
    version: z.string().regex(/^[1-9]\d*$/),
    locale: z.enum(["en", "zh-HK"]),
    audience: z.enum(["public", "staff"]),
    effectiveFrom: z.string().datetime({ offset: true }),
    effectiveTo: z.string().datetime({ offset: true }).nullable(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type KnowledgeRef = z.infer<typeof knowledgeRefSchema>;
