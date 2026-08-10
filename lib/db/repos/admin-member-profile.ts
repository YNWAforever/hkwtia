import "server-only";

import {eq} from "drizzle-orm";
import {z} from "zod";

import {routing} from "@/i18n/routing";
import {requireAdmin} from "@/lib/auth/authorize";
import {getDb} from "@/lib/db/repos/common";
import {auditEvents, profiles, type Profile} from "@/lib/db/server-schema";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

const profileIdSchema = z.string().min(1).max(200);

/**
 * The fields staff may correct on a member's behalf, and deliberately no more.
 *
 * Excluded, each for its own reason:
 * - `role` — a staff member editing roles could grant themselves superadmin.
 *   Role changes belong to a reviewed path, not a text field on a CRM page.
 * - `email` and `authUserId` — identity. `email` is the billing and sign-in
 *   handle, so changing it here would desynchronise Stripe and Neon Auth
 *   rather than correct anything.
 * - `consentMarketing`, `whatsappOptIn`, `directoryVisible` — consent and
 *   privacy are the member's to give. Staff toggling them on someone's behalf
 *   would forge a record of a choice the member never made.
 * - `onboardingState`, `interests`, `lastLoginAt` — derived from what the
 *   member actually did; editing them would falsify history.
 *
 * What is left is contact detail a member might phone in to correct.
 */
const memberProfileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  // Nullable rather than required: these are genuinely optional on the table,
  // and a cleared field must be storable as absent rather than as "".
  phone: z.string().trim().max(50).transform((value) => value || null).nullable(),
  jobTitle: z.string().trim().max(200).transform((value) => value || null).nullable(),
  locale: z.enum(routing.locales),
}).strict();

export type MemberProfileUpdate = z.output<typeof memberProfileUpdateSchema>;

export type MemberProfileMutationDependencies = Readonly<{transaction: <T>(work: (transaction: Readonly<{
  lockProfile: (id: string) => Promise<Profile | null>;
  updateProfile: (id: string, input: MemberProfileUpdate) => Promise<Profile | null>;
  insertAudit: (input: Readonly<{
    actorUserId: string;
    actorType: AdminActor["kind"];
    action: "profile.updated";
    targetType: "profile";
    targetId: string;
    metadata: Record<string, unknown>;
  }>) => Promise<void>;
}>) => Promise<T>) => Promise<T>}>;

async function defaultDependencies(): Promise<MemberProfileMutationDependencies> {
  const db = await getDb();
  return {transaction: (work) => db.transaction(async (tx) => work({
    lockProfile: async (id) =>
      (await tx.select().from(profiles).where(eq(profiles.id, id)).for("update"))[0] ?? null,
    updateProfile: async (id, input) =>
      (await tx.update(profiles).set({...input, updatedAt: new Date()})
        .where(eq(profiles.id, id)).returning())[0] ?? null,
    insertAudit: async (input) => { await tx.insert(auditEvents).values(input); },
  }))};
}

/**
 * Corrects a member's contact details. The audit row names the fields that
 * changed but not their values: this is personal data, and the audit log is
 * read far more widely than the profile itself.
 */
export async function updateMemberProfile(
  actor: Actor,
  profileId: unknown,
  input: unknown,
  dependencies?: MemberProfileMutationDependencies,
): Promise<Profile | null> {
  requireAdmin(actor);
  const id = profileIdSchema.parse(profileId);
  const parsed = memberProfileUpdateSchema.parse(input);
  return (dependencies ?? await defaultDependencies()).transaction(async (transaction) => {
    const current = await transaction.lockProfile(id);
    if (!current) return null;
    const changed = (Object.keys(parsed) as (keyof MemberProfileUpdate)[])
      .filter((key) => current[key] !== parsed[key])
      .sort();
    // A save that changes nothing is not an event worth recording.
    if (changed.length === 0) return current;
    const row = await transaction.updateProfile(id, parsed);
    if (!row) return null;
    await transaction.insertAudit({
      actorUserId: actor.profileId,
      actorType: actor.kind,
      action: "profile.updated",
      targetType: "profile",
      targetId: row.id,
      metadata: {fields: changed},
    });
    return row;
  });
}

export type EditableMemberProfile = Readonly<{
  id: string;
  displayName: string;
  phone: string | null;
  jobTitle: string | null;
  locale: string;
}>;

/**
 * Just the editable fields. Member 360 has its own projection tuned to what
 * that view renders; widening it to carry two more columns would couple an
 * unrelated read to this form.
 */
export async function getEditableMemberProfile(
  actor: Actor,
  profileId: unknown,
  loadProfile?: (id: string) => Promise<EditableMemberProfile | null>,
): Promise<EditableMemberProfile | null> {
  requireAdmin(actor);
  const parsed = profileIdSchema.safeParse(profileId);
  if (!parsed.success) return null;
  if (loadProfile) return loadProfile(parsed.data);
  const db = await getDb();
  return (await db.select({
    id: profiles.id,
    displayName: profiles.displayName,
    phone: profiles.phone,
    jobTitle: profiles.jobTitle,
    locale: profiles.locale,
  }).from(profiles).where(eq(profiles.id, parsed.data)).limit(1))[0] ?? null;
}

export const adminMemberProfileRepository = {
  get: getEditableMemberProfile,
  update: updateMemberProfile,
};
