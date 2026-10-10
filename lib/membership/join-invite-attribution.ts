import "server-only";

import {cookies} from "next/headers";

import {joinInvitesRepository} from "@/lib/db/repos/join-invites";
import {INVITE_COOKIE_NAME, readInviteCookie} from "@/lib/membership/join-invite-cookie";
import type {Actor} from "@/lib/membership/lifecycle";

/** Only keys that carry a value, so `draft.x ?? defaults.x ?? ""` lets a saved draft win. */
export type InviteDefaults = Readonly<{
  displayName?: string;
  whatsappNumber?: string;
  legalName?: string;
  companyDisplayName?: string;
}>;

/**
 * Form defaults for an invited applicant. The invite id is read from the httpOnly cookie and goes no
 * further than this function: the caller gets field values to render as input defaults, never the id.
 * A spent, superseded, expired or missing invite prefills nothing, and a read failure must not take
 * the join step down with it.
 */
export async function inviteDefaults(): Promise<InviteDefaults> {
  try {
    const inviteId = await readInviteCookie();
    if (!inviteId) return {};
    const prefill = await joinInvitesRepository.prefillFor(inviteId);
    if (!prefill) return {};
    const result: {displayName?: string; whatsappNumber?: string; legalName?: string; companyDisplayName?: string} = {};
    if (prefill.displayName) result.displayName = prefill.displayName;
    if (prefill.phone) result.whatsappNumber = prefill.phone;
    if (prefill.organisation) {
      result.legalName = prefill.organisation;
      result.companyDisplayName = prefill.organisation;
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Attributes a submitted application to the invite the applicant arrived through. Called between
 * `completeApplication` and `redirectToOutcome`, so it must never throw (a failure here must not turn
 * a saved application into a "could not save" message) and must finish before the redirect.
 *
 * The cookie is cleared after any consume attempt, `consumed` or `not_live`: a spent or superseded
 * invite has nothing left to attribute, and a stale cookie would only re-run this on the next submit.
 * The log line carries the application id only: no token, no invite id, no contact detail.
 */
export async function attributeJoinInvite(actor: Actor, applicationId: string): Promise<void> {
  if (actor.kind !== "member") return;
  try {
    const inviteId = await readInviteCookie();
    if (!inviteId) return;
    try {
      await joinInvitesRepository.consume(actor, {inviteId, applicationId});
    } finally {
      (await cookies()).delete({name: INVITE_COOKIE_NAME, path: "/"});
    }
  } catch {
    console.error("join_invite.attribution_failed", {applicationId});
  }
}
