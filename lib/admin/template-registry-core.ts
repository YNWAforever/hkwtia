import "server-only";

import {requireAdmin} from "@/lib/auth/authorize";
import {
  whatsappTemplatesRepository,
  type WhatsAppTemplateRecord,
  type WhatsAppTemplatesRepository,
} from "@/lib/db/repos/whatsapp-templates";
import type {Actor} from "@/lib/membership/lifecycle";

/**
 * Programme C-7. The actor-taking core of `/admin/templates`.
 *
 * These take the actor as their first argument, so they must never live in a
 * `"use server"` module: that directive publishes *every* export as an
 * HTTP-callable endpoint, and an endpoint whose caller supplies the actor has no
 * authorization at all. Only the `…Action(path, formData)` wrappers in
 * `lib/admin/template-registry-actions.ts` are dispatchable, and each resolves
 * the actor from the session itself.
 *
 * Shaped on `lib/admin/profile-review-core.ts` (B-7), because approving a
 * template and approving a member page are the same job over different rows and
 * a reviewer who has learned one should not have to relearn the other.
 *
 * `requireAdmin` runs here as well as in the repository — the repository is the
 * authorization gate, but refusing before the key/status parse keeps a non-admin
 * from learning which template keys are well-formed.
 */
export type TemplateRegistryWriter = Pick<
  WhatsAppTemplatesRepository,
  "setStatus" | "updatePreviews"
>;

export async function approveTemplate(
  actor: Actor,
  key: unknown,
  deps: TemplateRegistryWriter = whatsappTemplatesRepository,
): Promise<WhatsAppTemplateRecord> {
  requireAdmin(actor);
  // No reason on an approval: `rejection_reason` is the record of why something
  // may NOT be sent, and leaving a previous rejection's text attached to a live
  // template is how a reviewer comes to trust the wrong line.
  return deps.setStatus(actor, key, "approved", null);
}

export async function rejectTemplate(
  actor: Actor,
  key: unknown,
  reason: unknown,
  deps: TemplateRegistryWriter = whatsappTemplatesRepository,
): Promise<WhatsAppTemplateRecord> {
  requireAdmin(actor);
  return deps.setStatus(actor, key, "rejected", reason);
}

export async function disableTemplate(
  actor: Actor,
  key: unknown,
  reason: unknown,
  deps: TemplateRegistryWriter = whatsappTemplatesRepository,
): Promise<WhatsAppTemplateRecord> {
  requireAdmin(actor);
  // A reason is optional here and required on a rejection: a disable is usually
  // Meta pausing a template on us, which staff may not have a sentence for yet,
  // and forcing one would only produce "n/a" rows.
  return deps.setStatus(actor, key, "disabled", reason === null || reason === "" ? null : reason);
}

export async function saveTemplatePreviews(
  actor: Actor,
  key: unknown,
  previews: unknown,
  deps: TemplateRegistryWriter = whatsappTemplatesRepository,
): Promise<WhatsAppTemplateRecord> {
  requireAdmin(actor);
  return deps.updatePreviews(actor, key, previews);
}
