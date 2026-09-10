import "server-only";

import {and, eq, sql} from "drizzle-orm";

import type {Actor} from "@/lib/membership/lifecycle";
import {auditEvents, profiles as profilesTable, type Profile} from "@/lib/db/server-schema";
import {forbidden, getDb, requireMember, requireSystem} from "@/lib/db/repos/common";

type ProfileConsentColumns = "whatsappNumber" | "whatsappOptIn" | "whatsappConsentAt" | "whatsappConsentSource" | "whatsappConsentTextVersion" | "marketingConsentAt";
export type ProfileInput = Pick<Profile, "id" | "displayName"> & Partial<Pick<Profile, "phone" | "jobTitle" | "locale" | "onboardingState" | "directoryVisible" | ProfileConsentColumns>>;
export type ProfileUpdate = Partial<Pick<Profile, "displayName" | "phone" | "jobTitle" | "locale" | "onboardingState" | "directoryVisible" | ProfileConsentColumns>>;

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
    if (actor.kind === "system") requireSystem(actor);
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
    if (actor.kind === "system") requireSystem(actor);
    if (actor.kind === "anonymous") forbidden();
    const db = await getDb();
    const rows = await db.insert(profilesTable).values({...input, authUserId: actor.kind === "system" ? input.id : actor.userId}).returning();
    return rows[0];
  },

  /**
   * Boundary 11 lives HERE, not in the two callers.
   *
   * `lib/portal/command-core.ts` and `/join`'s `saveProfile` both write a
   * WhatsApp consent GRANT or WITHDRAWAL through this method, and it used to be
   * a bare `UPDATE profiles`: no `audit_events` row, no suppression bookkeeping,
   * no trace of a consent decision with legal weight. The withdrawal side is
   * also what left `suppressionsRepository.optOutWhatsApp` reasoning about a
   * re-consent it could not see — that method treats the flag transition as
   * evidence of a new withdrawal precisely because this surface can grant the
   * flag back while the suppression row (which nothing deletes) stays.
   *
   * Putting the gate in the repository rather than in the callers is boundary
   * 1/2: a third surface that learns to write the flag inherits the audit row
   * instead of having to remember it.
   *
   * Only a TRANSITION is audited. Every portal save posts a `whatsappOptIn`
   * value because the form carries the checkbox either way, so auditing the
   * value rather than the change would mint a consent event every time somebody
   * corrected their job title, and a trail that says everything says nothing.
   *
   * The prior value is read with `SELECT … FOR UPDATE` inside the transaction,
   * which takes the row lock BEFORE the write: two concurrent saves serialise,
   * and the loser re-reads the committed value, so exactly one of them audits.
   * A self-join returning the old value in one statement would read its own
   * pre-lock snapshot and audit twice — the hazard
   * `lib/db/repos/suppressions.ts` records for the same reason.
   */
  async update(actor: Actor, userId: string, input: ProfileUpdate): Promise<Profile | null> {
    requireMember(actor);
    if (actor.profileId !== userId) forbidden();
    const consentWrite = input.whatsappOptIn !== undefined;
    const db = await getDb();
    return db.transaction(async (transaction) => {
      const before = consentWrite
        ? await transaction
          .select({whatsappOptIn: profilesTable.whatsappOptIn})
          .from(profilesTable)
          .where(and(eq(profilesTable.id, userId), eq(profilesTable.id, actor.profileId)))
          .limit(1)
          .for("update")
        : [];
      const rows = await transaction
        .update(profilesTable)
        .set({...input, updatedAt: new Date()})
        .where(and(eq(profilesTable.id, userId), eq(profilesTable.id, actor.profileId)))
        .returning();
      const updated = rows[0] ?? null;
      const prior = before[0];
      if (updated && prior !== undefined && prior.whatsappOptIn !== input.whatsappOptIn) {
        await transaction.insert(auditEvents).values({
          actorUserId: userId,
          actorType: actor.kind,
          action: input.whatsappOptIn ? "consent.whatsapp.granted" : "consent.whatsapp.revoked",
          targetType: "profile",
          targetId: userId,
          // The source is null on a withdrawal by construction:
          // `whatsappConsentFields` clears the provenance when the flag comes
          // off, which is the point of those columns. Which surface withdrew it
          // is carried by this row's own actor and timestamp instead.
          metadata: {
            optIn: input.whatsappOptIn === true,
            consentSource: input.whatsappConsentSource ?? null,
            consentTextVersion: input.whatsappConsentTextVersion ?? null,
          },
        });
      }
      return updated;
    });
  },

  async remove(actor: Actor, userId: string): Promise<void> {
    if (actor.kind !== "system" && (actor.kind !== "member" || actor.profileId !== userId)) forbidden();
    if (actor.kind === "system") requireSystem(actor);
    const db = await getDb();
    await db.delete(profilesTable).where(and(eq(profilesTable.id, userId), profileScope(actor, userId)));
  },
};

export const profilesRepo = profilesRepository;

export const profiles = profilesRepository;
