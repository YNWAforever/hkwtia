import "server-only";

import {requireAdmin, systemActor} from "@/lib/auth/authorize";
import type {NeonSession} from "@/lib/auth/server";
import {type AdminActor, type AuthenticatedActor} from "@/lib/membership/lifecycle";
import {profileIdentityRepository, type ProfileIdentityResolver} from "@/lib/db/repos/profile-identities";

// Re-exported so a caller that already reaches for the session keeps one import.
// Anything that needs only these should import "@/lib/auth/authorize" directly:
// this module pulls in the Neon Auth client, and that dependency is transitive.
export {requireAdmin, systemActor};

type SessionLike = Pick<NeonSession, "user"> | {user?: {id?: string | null}};

/** Resolve an authenticated session against the application profile authority. */
export async function sessionToActor(
  session: SessionLike | null | undefined,
  resolver: ProfileIdentityResolver = profileIdentityRepository,
): Promise<AuthenticatedActor | null> {
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0) return null;
  const identity = await resolver.resolve(userId);
  if (!identity) return null;
  return {kind: identity.role, userId, profileId: identity.profileId};
}

/**
 * The session reader is imported here, at call time, rather than at module
 * scope.
 *
 * `lib/auth/server` constructs the Neon Auth client and calls `authEnv()` while
 * it evaluates, so a static import makes *importing this module* fail in
 * production without the Neon Auth pair. A public page must import the Server
 * Action it binds to a form, and an action module resolves its own actor from
 * here — so `/launchpad`, which renders a cohort list for a hard-coded
 * `anonymous` actor and never reads a session, failed before rendering a line.
 *
 * The type import above is erased at compile time and costs nothing. Deferring
 * the value import keeps the failure attached to actually reading a session,
 * which is the only thing that needs the credentials, and leaves
 * `lib/auth/server`'s own import-time check exactly as strict for anything that
 * imports it directly.
 */
export async function getActor(resolver: ProfileIdentityResolver = profileIdentityRepository): Promise<AuthenticatedActor | null> {
  const {getSession} = await import("@/lib/auth/server");
  const actor = await sessionToActor(await getSession(), resolver);
  if (actor) void resolver.touchLastLogin?.(actor.profileId).catch(() => undefined);
  return actor;
}

export async function requireActor(): Promise<AuthenticatedActor> {
  const actor = await getActor();
  if (!actor) throw new Error("UNAUTHORIZED");
  return actor;
}

export async function requireAdminActor(): Promise<AdminActor> {
  const actor = await requireActor();
  requireAdmin(actor);
  return actor;
}
