import "server-only";

import {forbidden, type Actor, type AdminActor} from "@/lib/membership/lifecycle";

/**
 * Authorization predicates that decide against an `Actor` the caller already
 * holds. They read no session, no cookie and no environment.
 *
 * They live apart from `lib/auth/actor` deliberately. That module reads the
 * session, so it imports `lib/auth/server`, which constructs the Neon Auth
 * client and calls `authEnv()` at module scope — a hard failure in production
 * when the Neon Auth pair is absent. Because `import` is transitive, a
 * repository that wanted only `requireAdmin` used to drag that whole chain in,
 * and `/sitemap.xml`, `/events`, `/showcase`, `/launchpad` and `/join` then
 * failed on import, before any of their own code ran. The sitemap's per-read
 * `try`/`catch` never fired, because nothing had thrown yet at the point it
 * guards.
 *
 * Splitting them keeps that fail-closed check exactly as strict for anything
 * that authenticates, while letting a public read depend only on what it uses.
 * Import from here when you have an `Actor`; import from `lib/auth/actor` when
 * you need to resolve one.
 */
export function requireAdmin(actor: Actor): asserts actor is AdminActor {
  if (actor.kind !== "staff" && actor.kind !== "exco" && actor.kind !== "superadmin") forbidden();
}

export function systemActor(source: "stripe-webhook"): Actor {
  return {kind: "system", userId: null, source};
}
