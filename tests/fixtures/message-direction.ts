/**
 * The twin of `drizzle/0032_phase_c_message_direction_backfill.sql` now lives in
 * `lib/db/message-direction.ts`, because production code may not import a
 * fixture and the two `INSERT INTO messages` writers have to share the exact
 * derivation the backfill used (C-1 Task 3 Step 5). Re-exported here unchanged
 * so `tests/unit/phase-c-schema-contract.test.ts` keeps its Task 1 import.
 */
export {derivedMessageDirection} from "@/lib/db/message-direction";
