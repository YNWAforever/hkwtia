import type {Message} from "@/lib/db/server-schema";

/**
 * The TypeScript twin of `drizzle/0032_phase_c_message_direction_backfill.sql`,
 * the way `tests/fixtures/event-row.ts` mirrors 0027 (programme D-12). The
 * backfill runs once against a database no local gate has, so its derivation is
 * only ever asserted as behaviour, through this function.
 *
 * It lives under `lib/db/` rather than `tests/fixtures/` (where Task 1 first put
 * it) because production code may not import a fixture, and the writers *have*
 * to share the derivation: `messages.direction` defaults to `'inbound'` (plan
 * S-4), so a writer that re-derives it — or forgets it — silently labels every
 * outbound row inbound, and four things then fail at once with no type error
 * (no delivery ticks, `stampConciergeDelivery` never stamping, echoes inserting
 * a duplicate row instead of adopting, and the thread UI rendering the
 * concierge on the prospect's side). `tests/fixtures/message-direction.ts`
 * re-exports this, so the Task 1 contract test is unchanged.
 *
 * The type-only `Message` import keeps this module clear of the runtime
 * database boundary that `tests/unit/repository-boundary.test.ts` enforces for
 * everything outside `lib/db/repos/`.
 */
export function derivedMessageDirection(row: Pick<Message, "role">): "inbound" | "outbound" {
  return row.role === "user" ? "inbound" : "outbound";
}
