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

/**
 * The non-throwing half of `requireAdmin`. A caller that must *route* on the
 * answer rather than refuse on it needs a predicate: throwing to decide where
 * to redirect turns ordinary navigation into an error-boundary render, which
 * is exactly what `/portal` did to every signed-in staff member.
 */
export function isAdminActor(actor: Actor): actor is AdminActor {
  return actor.kind === "staff" || actor.kind === "exco" || actor.kind === "superadmin";
}

/**
 * Throwing counterpart to `isAdminActor`, for a caller that refuses rather than
 * routes. Delegates to it so the admin-kind set is defined in exactly one
 * place: TypeScript never checks a hand-written `x is T` predicate against
 * `T`, so without this delegation nothing would force the two to move
 * together if the admin-kind set ever changed.
 */
export function requireAdmin(actor: Actor): asserts actor is AdminActor {
  if (!isAdminActor(actor)) forbidden();
}

/**
 * The authority an automated writer acts under. The source is a closed union so
 * a new automated writer is a reviewed change rather than a string. It is the
 * caller's own label for why it is acting: an audit row records the actor's
 * *kind* (`actorType: "system"`, with no user id) rather than the source, so a
 * person's action and an automated one are never confused in the log.
 */
export function systemActor(source: "stripe-webhook" | "event-cancellation"): Extract<Actor, {kind: "system"}> {
  return {kind: "system", userId: null, source};
}
