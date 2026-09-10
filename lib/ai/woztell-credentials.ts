import "server-only";

import {createHmac} from "node:crypto";

import type {WoztellEnvironment} from "@/lib/channels/woztell";
import type {AiEnv} from "@/lib/config/env";

/**
 * The three conditional spreads that turn `aiEnv()`'s optional camelCase fields
 * into the adapter's `WOZTELL_*` shape, written once.
 *
 * They were hand-written at two call sites — `lib/api/woztell-webhook-route.ts`
 * and `lib/jobs/runners.ts` — and Phase C1 Task 7 adds a third that can send a
 * staff reply to a member. Three copies of a spread that decides which
 * credentials reach the provider is three places to audit before C-9, so the
 * webhook route now reads this and the third site is born reading it.
 *
 * `lib/jobs/runners.ts` is deliberately NOT switched: its inline spread carries
 * the incident comment about the omitted `RUN_LIVE_WOZTELL`, which must stay
 * attached to that call, and C2 Task 10 adds a discovery test over every
 * `createWoztellAdapter(` call site that will re-open the question with a
 * mechanism behind it.
 *
 * **Credentials only. `RUN_LIVE_WOZTELL` is not here and must never be.** It is
 * the switch that decides whether a real message leaves the building, and
 * `lib/jobs/runners.ts:421-427` records what omitting it costs: an outbound path
 * that forgot it recorded journey and dunning WhatsApp messages as delivered
 * while nothing was sent, and a member in dunning never got the reminder the log
 * says they did. A helper that supplied it would make forgetting it invisible;
 * leaving it as an explicit argument at every construction site means a missing
 * one is visible in the diff that introduces it.
 */
export function woztellCredentialsFrom(ai: AiEnv): Partial<WoztellEnvironment> {
  return {
    ...(ai.woztellApiToken === undefined ? {} : {WOZTELL_API_TOKEN: ai.woztellApiToken}),
    ...(ai.woztellChannelId === undefined ? {} : {WOZTELL_CHANNEL_ID: ai.woztellChannelId}),
    ...(ai.woztellWebhookSecret === undefined ? {} : {WOZTELL_WEBHOOK_SECRET: ai.woztellWebhookSecret}),
  };
}

/**
 * The anonymous conversation OWNER KEY, derived in one place.
 *
 * D-6 pins `conversations.anonymous_owner_hash` as the owner key for a
 * conversation with no profile, and `conversations_owner_check` is two-armed:
 * this HMAC is the only thing that says "these two threads are the same person".
 * It was written inline in `createProductionWoztellProcessorDependencies`, and
 * C-3's backfill is the second entry point that has to produce it — for the same
 * numbers, into the same table, with the same reuse predicate. Two derivations
 * that drifted by one character would not fail: they would quietly open a SECOND
 * conversation for every person whose history was imported, splitting exactly
 * the threads the inbox exists to unify.
 *
 * The secret falls back the way the webhook always has (`conciergeCookieSecret`
 * then `woztellWebhookSecret` then `""`), and both call sites must keep that
 * order — a different fallback is a different hash.
 */
export function woztellAnonymousOwnerHash(
  ai: AiEnv,
  normalizedSender: string,
): string {
  const secret = ai.conciergeCookieSecret ?? ai.woztellWebhookSecret ?? "";
  return createHmac("sha256", secret).update(normalizedSender).digest("hex");
}
