import "server-only";
import {z} from "zod";
import type {MembershipApplication} from "@/lib/db/server-schema";
import {requireMember, type Actor} from "@/lib/membership/lifecycle";

export type OwnedApplicationRow = MembershipApplication & {cursorTime: string};
const cursorSchema = z.object({v: z.literal(1), scope: z.literal("owned-applications"), ownerId: z.string().min(1), time: z.string().datetime().regex(/\.\d{6}Z$/), id: z.string().uuid()}).strict();
type Position = {time: string; id: string};
/** Adapter must enforce ownerId in the query and order by updated_at DESC, id DESC.
 * cursorTime preserves PostgreSQL microseconds, which JS Date would truncate. */
export interface OwnedApplicationPort {
  select(query: {ownerId: string; take: number; after: Position | null}): Promise<readonly OwnedApplicationRow[]>;
  find(query: {ownerId: string; id: string}): Promise<MembershipApplication | null>;
}
export class OwnedApplicationReadError extends Error {
  readonly code = "APPLICATION_READ_FAILED";
  constructor() { super("APPLICATION_READ_FAILED"); this.name = "OwnedApplicationReadError"; }
}
export type OwnedApplicationPageInput = {cursor?: string; limit?: number};
export function createOwnedApplicationReader(port: OwnedApplicationPort) {
  return {
    async listOwnedPage(actor: Actor, raw: OwnedApplicationPageInput = {}) {
      requireMember(actor);
      const parsed = z.object({cursor: z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/).optional(), limit: z.number().int().positive().optional()}).strict().safeParse(raw);
      if (!parsed.success) throw Error("INVALID_APPLICATION_PAGE");
      const {cursor} = parsed.data;
      const limit = Math.min(parsed.data.limit ?? 20, 50);
      let after: Position | null = null;
      if (cursor) {
        try {
          const decoded = cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
          if (decoded.ownerId !== actor.profileId) throw Error();
          after = {time: decoded.time, id: decoded.id};
        } catch { throw Error("INVALID_APPLICATION_PAGE"); }
      }
      let rows: readonly OwnedApplicationRow[];
      try { rows = await port.select({ownerId: actor.profileId, take: limit + 1, after}); }
      catch { throw new OwnedApplicationReadError(); }
      const visible = rows.slice(0, limit);
      const last = visible.at(-1);
      const nextCursor = rows.length > limit && last ? Buffer.from(JSON.stringify({v: 1, scope: "owned-applications", ownerId: actor.profileId, time: last.cursorTime, id: last.id})).toString("base64url") : null;
      return {items: visible.map(({cursorTime, ...row}) => { void cursorTime; return row; }), nextCursor};
    },
    async getOwnedById(actor: Actor, id: string): Promise<MembershipApplication | null> {
      requireMember(actor);
      if (!z.string().uuid().safeParse(id).success) return null;
      try { return await port.find({ownerId: actor.profileId, id}); }
      catch { throw new OwnedApplicationReadError(); }
    },
  };
}
