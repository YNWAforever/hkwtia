import {z} from "zod";

export type CursorPage<T> = Readonly<{items: readonly T[]; nextCursor: string | null}>;

const pageQuerySchema = z.object({
  search: z.string().trim().max(120).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(1000).nullable().default(null),
}).strict();
export type PageQuery = z.infer<typeof pageQuerySchema>;

export function parsePageQuery(input: unknown): PageQuery {
  return pageQuerySchema.parse(input);
}

const keySchema = z.tuple([z.string().max(300), z.string().max(100), z.string().max(200)]);
const cursorPayloadSchema = z.object({v: z.literal(1), scope: z.string().max(500), key: keySchema}).strict();
export type PageCursorKey = z.infer<typeof keySchema>;

/** Scope includes the authorised target, section and normalized search. */
export function encodeScopedCursor(scope: string, key: PageCursorKey): string {
  return Buffer.from(JSON.stringify(cursorPayloadSchema.parse({v: 1, scope, key})), "utf8").toString("base64url");
}

export function decodeScopedCursor(scope: string, cursor: string): PageCursorKey {
  try {
    if (cursor.length > 1000 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("INVALID_CURSOR");
    const payload = cursorPayloadSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    if (payload.scope !== scope) throw new Error("INVALID_CURSOR");
    return payload.key;
  } catch {
    throw new Error("INVALID_CURSOR");
  }
}
