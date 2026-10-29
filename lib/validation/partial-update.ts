import {z} from "zod";

/** Patch omissions must never apply create-time defaults (Zod 4 applies defaults inside optional). */
export function partialUpdate<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const partial = schema.partial();
  const fields = Object.fromEntries(Object.entries(schema.shape).map(([key, field]) => {
    // Undefined wins before a pipeline/default can synthesize a value.
    return [key, z.union([z.undefined(), field]).optional()];
  }));
  // The undefined-first union preserves each field output type and makes it optional.
  return partial.extend(fields) as unknown as typeof partial;
}
