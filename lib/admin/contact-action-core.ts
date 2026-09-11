import "server-only";

import {requireAdmin} from "@/lib/auth/authorize";
import {
  contactsRepository,
  type ContactRow,
  type ContactsRepository,
} from "@/lib/db/repos/contacts";
import type {Actor} from "@/lib/membership/lifecycle";

/**
 * Programme C-4. The actor-taking core of `/admin/contacts`.
 *
 * These take the actor as their first argument, so they must never live in a
 * `"use server"` module: that directive publishes *every* export as an
 * HTTP-callable endpoint, and an endpoint whose caller supplies the actor has no
 * authorization at all. Only the `…Action(path, formData)` wrappers in
 * `lib/admin/contact-actions.ts` are dispatchable, and each resolves the actor
 * from the session itself.
 *
 * The non-async helpers below live here for the same boundary: every runtime
 * export of a `"use server"` module must be a provably-async function, so a
 * form-parsing helper or a path allowlist cannot sit beside the wrapper that
 * uses it (`tests/unit/server-action-actor-boundary.test.ts`).
 */
export type ContactPipelineWriter = Pick<ContactsRepository, "updatePipeline">;

/**
 * `formData.has` rather than `formData.get`, because ABSENT and EMPTY are
 * different answers here. A row renders two forms — one for the stage, one for
 * the owner — and each submits only its own field; treating an absent field as
 * an empty one would have the stage form unassign the contact's owner every
 * time an admin moved a prospect to "contacted".
 */
export function contactPipelineInput(formData: FormData): Readonly<{
  stage?: string;
  ownerProfileId?: string | null;
}> {
  const input: {stage?: string; ownerProfileId?: string | null} = {};
  if (formData.has("stage")) {
    const stage = formData.get("stage");
    if (typeof stage === "string") input.stage = stage;
  }
  if (formData.has("ownerProfileId")) {
    const owner = formData.get("ownerProfileId");
    // A `<select>`/hidden field submits "" for "nobody". That is an unassign,
    // not a profile id, and the repository's schema would refuse the empty
    // string — which the admin would read as a 500 on an Unassign button.
    input.ownerProfileId = typeof owner === "string" && owner.length > 0 ? owner : null;
  }
  return input;
}

/**
 * Where the browser goes after a save, so the confirmation can be shown without
 * losing the filter the operator is standing in.
 *
 * The value arrives in `formData` and is therefore client-supplied, so it is an
 * allowlist rather than a sanitiser: only this page, only its own query string,
 * and never a scheme, a host or a protocol-relative `//` that would turn a save
 * button into an open redirect. Anything else returns `null` and the action
 * simply does not redirect — a mutation that already succeeded must not fail
 * over where it was going to send the reader afterwards.
 */
// `*` is in the set because `URLSearchParams` does not percent-encode it (the
// urlencoded serializer's safe set is alphanumerics plus `*-._`, with space as
// `+`), so a staff search for `ada*` would otherwise fail the allowlist and
// silently cost the operator their confirmation.
const CONTACT_RETURN_PATH = /^\/(?:en\/|zh\/)?admin\/contacts(?:\?[A-Za-z0-9=&%_.+*-]*)?$/;

export function contactReturnPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 500) return null;
  return CONTACT_RETURN_PATH.test(value) ? value : null;
}

export async function updateContactPipeline(
  actor: Actor,
  contactId: unknown,
  input: unknown,
  deps: ContactPipelineWriter = contactsRepository,
): Promise<ContactRow> {
  requireAdmin(actor);
  return deps.updatePipeline(actor, contactId, input);
}
