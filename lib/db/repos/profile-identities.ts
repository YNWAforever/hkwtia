import "server-only";

import {and, eq, isNull, lte, or, sql} from "drizzle-orm";

import {getDb, type Database} from "@/lib/db/repos/common";
import {profiles} from "@/lib/db/server-schema";
import type {AuthenticatedActorKind} from "@/lib/membership/lifecycle";

export type ProfileIdentity = Readonly<{profileId: string; role: AuthenticatedActorKind}>;
export type ProfileIdentityResolver = Readonly<{
  resolve: (authUserId: string) => Promise<ProfileIdentity | null>;
  touchLastLogin?: (profileId: string) => Promise<void>;
}>;

export type ProfileProvisionResult =
  | {kind: "ready"; identity: ProfileIdentity}
  | {kind: "conflict"};

type VerifiedSubject = Readonly<{authUserId: string; email: string; displayName: string}>;

export function createProfileIdentityRepository(loadDatabase: () => Promise<Database> = getDb) {
  return {
    async resolve(authUserId: string): Promise<ProfileIdentity | null> {
      const db = await loadDatabase();
      const rows = await db.select({profileId: profiles.id, role: profiles.role})
        .from(profiles).where(eq(profiles.authUserId, authUserId)).limit(1);
      return rows[0] ?? null;
    },
    async getDisplayName(profileId: string): Promise<string | null> {
      const db = await loadDatabase();
      const rows = await db.select({displayName: profiles.displayName})
        .from(profiles).where(eq(profiles.id, profileId)).limit(1);
      return rows[0]?.displayName ?? null;
    },
    async touchLastLogin(profileId: string): Promise<void> {
      const db = await loadDatabase();
      const now = new Date();
      const cutoff = new Date(now.getTime() - 15 * 60_000);
      await db.update(profiles).set({lastLoginAt: now}).where(and(
        eq(profiles.id, profileId),
        or(isNull(profiles.lastLoginAt), lte(profiles.lastLoginAt, cutoff)),
      ));
    },
    /** The caller must derive this subject from a verified server-side Neon session. */
    async provisionMember(input: VerifiedSubject): Promise<ProfileProvisionResult> {
      const email = input.email.trim().toLowerCase();
      if (!input.authUserId || !email || email.length > 320) return {kind: "conflict"};
      const displayName = input.displayName.trim().slice(0, 120) || "WTIA member";
      const db = await loadDatabase();
      return db.transaction(async (transaction) => {
        // Serialize different Auth subjects claiming the same verified address. This lock only
        // coordinates provisioning; it never links a new subject to an existing staff profile.
        await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${email}, 0))`);
        const existing = await transaction.select({profileId: profiles.id, role: profiles.role})
          .from(profiles).where(eq(profiles.authUserId, input.authUserId)).limit(1);
        if (existing[0]) return {kind: "ready" as const, identity: existing[0]};
        const sameEmail = await transaction.select({authUserId: profiles.authUserId})
          .from(profiles).where(sql`lower(${profiles.email}) = ${email}`).limit(1);
        if (sameEmail[0]) return {kind: "conflict" as const};
        await transaction.insert(profiles).values({
          id: input.authUserId, authUserId: input.authUserId, email,
          role: "member", displayName,
        }).onConflictDoNothing();
        const created = await transaction.select({profileId: profiles.id, role: profiles.role})
          .from(profiles).where(eq(profiles.authUserId, input.authUserId)).limit(1);
        return created[0] ? {kind: "ready" as const, identity: created[0]} : {kind: "conflict" as const};
      });
    },
  };
}

export const profileIdentityRepository = createProfileIdentityRepository();

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
