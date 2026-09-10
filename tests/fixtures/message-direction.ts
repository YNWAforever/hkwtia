import type {Message} from "@/lib/db/server-schema";

/** The TypeScript twin of `drizzle/0032_phase_c_message_direction_backfill.sql`,
 * the way tests/fixtures/event-row.ts mirrors 0027 (programme D-12). The
 * backfill runs once against a database no local gate has, so its derivation is
 * only ever asserted as behaviour through this mirror. `lib/db/repos/inbox.ts`
 * and `appendMessageFrom` must call this helper rather than re-deriving. */
export function derivedMessageDirection(row: Pick<Message, "role">): "inbound" | "outbound" {
  return row.role === "user" ? "inbound" : "outbound";
}
