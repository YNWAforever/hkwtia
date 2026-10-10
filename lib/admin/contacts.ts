import "server-only";

import {requireAdmin} from "@/lib/auth/authorize";
import {
  contactActivitiesRepository,
  type ContactActivitiesRepository,
  type ContactActivity,
} from "@/lib/db/repos/contact-activities";
import {
  contactsRepository,
  type BoardFilters,
  type ContactBoard,
  type ContactPage,
  type ContactRelated,
  type ContactRow,
  type ContactsRepository,
} from "@/lib/db/repos/contacts";
import {joinInvitesRepository, type JoinInvitesRepository} from "@/lib/db/repos/join-invites";
import type {Actor} from "@/lib/membership/lifecycle";

/**
 * Programme C-4. The `/admin/contacts` READ helpers, and only those.
 *
 * Shaped on `lib/admin/inbox.ts`, and split from the write lane for the same
 * reason: these take an `Actor` as their first argument, so a `"use server"`
 * module that re-exported one would publish an HTTP endpoint whose caller
 * supplies the actor — which authorizes nothing. The pipeline write lives in
 * `lib/admin/contact-action-core.ts`, and only the `…Action(path, formData)`
 * wrappers in `lib/admin/contact-actions.ts` are dispatchable.
 *
 * `requireAdmin` runs here as well as in the repository. The repository is the
 * authorization gate (boundary 2); this second check keeps a non-admin from
 * learning which filter shapes parse, because the filter parse happens on the
 * far side of it.
 */
export type ContactReader = Pick<ContactsRepository, "list" | "get">;

export async function listContacts(
  actor: Actor,
  filters: unknown,
  deps: ContactReader = contactsRepository,
): Promise<ContactPage> {
  requireAdmin(actor);
  return deps.list(actor, filters);
}

export async function getContact(
  actor: Actor,
  id: unknown,
  deps: ContactReader = contactsRepository,
): Promise<ContactRow | null> {
  requireAdmin(actor);
  return deps.get(actor, id);
}

/**
 * Phase E lead page reads. Same discipline as `getContact`: `requireAdmin` here
 * as well as in the repository, so a non-admin learns nothing from the shape of
 * a failure.
 */
export async function listContactActivities(
  actor: Actor,
  id: unknown,
  deps: Pick<ContactActivitiesRepository, "list"> = contactActivitiesRepository,
): Promise<readonly ContactActivity[]> {
  requireAdmin(actor);
  return deps.list(actor, id);
}

export async function getContactRelated(
  actor: Actor,
  id: unknown,
  deps: Pick<ContactsRepository, "related"> = contactsRepository,
): Promise<ContactRelated> {
  requireAdmin(actor);
  return deps.related(actor, id);
}

/** The newest join link made for this contact, with its state - never the link itself, which is not stored. */
export async function getLatestLeadInvite(
  actor: Actor,
  id: unknown,
  deps: Pick<JoinInvitesRepository, "latestForContact"> = joinInvitesRepository,
): Promise<Awaited<ReturnType<JoinInvitesRepository["latestForContact"]>>> {
  requireAdmin(actor);
  return deps.latestForContact(actor, id);
}

/** Phase E board. The same double `requireAdmin` as the reads above. */
export async function listContactBoard(
  actor: Actor,
  filters: BoardFilters,
  deps: Pick<ContactsRepository, "listBoard"> = contactsRepository,
): Promise<ContactBoard> {
  requireAdmin(actor);
  return deps.listBoard(actor, filters);
}
