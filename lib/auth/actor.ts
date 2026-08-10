import "server-only";

import {requireAdmin, systemActor} from "@/lib/auth/authorize";
import * as authServer from "@/lib/auth/server";
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

export async function getActor(resolver: ProfileIdentityResolver = profileIdentityRepository): Promise<AuthenticatedActor | null> {
  const actor = await sessionToActor(await authServer.getSession(), resolver);
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
