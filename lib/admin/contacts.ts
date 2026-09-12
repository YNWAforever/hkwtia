import "server-only";

import {requireAdmin} from "@/lib/auth/authorize";
import {
  contactsRepository,
  type ContactPage,
  type ContactRow,
  type ContactsRepository,
} from "@/lib/db/repos/contacts";
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
