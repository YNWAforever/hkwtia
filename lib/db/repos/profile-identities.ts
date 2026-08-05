import "server-only";

import {eq} from "drizzle-orm";

import {getDb} from "@/lib/db/repos/common";
import {profiles} from "@/lib/db/server-schema";
import type {AuthenticatedActorKind} from "@/lib/membership/lifecycle";

export type ProfileIdentity = Readonly<{profileId: string; role: AuthenticatedActorKind}>;
export type ProfileIdentityResolver = Readonly<{
  resolve: (authUserId: string) => Promise<ProfileIdentity | null>;
  touchLastLogin?: (profileId: string) => Promise<void>;
}>;

export const profileIdentityRepository: ProfileIdentityResolver = {
  async resolve(authUserId) {
    const db = await getDb();
    const rows = await db
      .select({profileId: profiles.id, role: profiles.role})
      .from(profiles)
      .where(eq(profiles.authUserId, authUserId))
      .limit(1);
    return rows[0] ?? null;
  },
  async touchLastLogin(profileId) {
    const db = await getDb();
    await db.update(profiles).set({lastLoginAt: new Date()}).where(eq(profiles.id, profileId));
  },
};

/**
 * The address already on file for the calling actor. Used only as a
 * server-side comparison key for agent tooling; it is never sent to a model.
 *
 * Takes no profile id on purpose: reading only the actor's own row means this
 * cannot become a way to look up another member's address.
 */
export async function actorContactEmail(
  actor: Readonly<{profileId: string}>,
): Promise<string | null> {
  const db = await getDb();
  const rows = await db
    .select({email: profiles.email})
    .from(profiles)
    .where(eq(profiles.id, actor.profileId))
    .limit(1);
  const email = rows[0]?.email?.trim();
  return email ? email.toLowerCase() : null;
}
