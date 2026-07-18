import "server-only";

import {and, eq, sql} from "drizzle-orm";

import type {Actor} from "@/lib/membership/lifecycle";
import {profiles as profilesTable, type Profile} from "@/lib/db/server-schema";
import {forbidden, getDb, requireMember} from "@/lib/db/repos/common";

export type ProfileInput = Pick<Profile, "id" | "displayName"> & Partial<Pick<Profile, "phone" | "jobTitle" | "locale" | "onboardingState" | "directoryVisible">>;
export type ProfileUpdate = Partial<Pick<Profile, "displayName" | "phone" | "jobTitle" | "locale" | "onboardingState" | "directoryVisible">>;

function profileScope(actor: Actor, userId: string) {
  if (actor.kind === "system") return sql`true`;
  if (actor.kind === "member") return and(eq(profilesTable.id, actor.profileId), eq(profilesTable.id, userId));
  return and(eq(profilesTable.id, userId), eq(profilesTable.directoryVisible, true));
}

export const profilesRepository = {
  async ensure(actor: Actor, input: ProfileInput): Promise<Profile> {
    requireMember(actor);
    if (actor.profileId !== input.id) forbidden();
    const db = await getDb();
    const rows = await db
      .insert(profilesTable)
      .values({...input, authUserId: actor.userId})
      .onConflictDoNothing({target: profilesTable.id})
      .returning();
    if (rows[0]) return rows[0];
    const existing = await db.select().from(profilesTable).where(eq(profilesTable.id, input.id)).limit(1);
    if (!existing[0]) forbidden();
    return existing[0];
  },
  async getById(actor: Actor, userId: string): Promise<Profile | null> {
    if (actor.kind === "member" && actor.profileId !== userId) forbidden();
    if (actor.kind === "anonymous") {
      const db = await getDb();
      const rows = await db.select().from(profilesTable).where(profileScope(actor, userId)).limit(1);
      return rows[0] ?? null;
    }
    const db = await getDb();
    const rows = await db.select().from(profilesTable).where(and(eq(profilesTable.id, userId), profileScope(actor, userId))).limit(1);
    return rows[0] ?? null;
  },

  async create(actor: Actor, input: ProfileInput): Promise<Profile> {
    if (actor.kind === "member" && actor.profileId !== input.id) forbidden();
    if (actor.kind === "anonymous") forbidden();
    const db = await getDb();
    const rows = await db.insert(profilesTable).values({...input, authUserId: actor.kind === "system" ? input.id : actor.userId}).returning();
    return rows[0];
  },

  async update(actor: Actor, userId: string, input: ProfileUpdate): Promise<Profile | null> {
    requireMember(actor);
    if (actor.profileId !== userId) forbidden();
    const db = await getDb();
    const rows = await db
      .update(profilesTable)
      .set({...input, updatedAt: new Date()})
      .where(and(eq(profilesTable.id, userId), eq(profilesTable.id, actor.profileId)))
      .returning();
    return rows[0] ?? null;
  },

  async remove(actor: Actor, userId: string): Promise<void> {
    if (actor.kind !== "system" && (actor.kind !== "member" || actor.profileId !== userId)) forbidden();
    const db = await getDb();
    await db.delete(profilesTable).where(and(eq(profilesTable.id, userId), profileScope(actor, userId)));
  },
};

export const profilesRepo = profilesRepository;

export const profiles = profilesRepository;
