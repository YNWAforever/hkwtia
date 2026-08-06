import "server-only";

import {z} from "zod";

import {showcaseRepository, type ShowcaseRepository} from "@/lib/db/repos/showcase";
import type {AdminActor} from "@/lib/membership/lifecycle";

/**
 * These take the actor as their first argument, so they must never live in a
 * `"use server"` module: that directive publishes *every* export as an
 * HTTP-callable endpoint, and an endpoint whose caller supplies the actor has
 * no authorization at all — `requireAdmin` would be checking an object the
 * attacker sent. Only the `…Action(path, formData)` wrappers in
 * `lib/admin/showcase-actions.ts` are dispatchable, and each resolves the actor
 * from the session itself.
 */
export type AdminShowcaseRepository = Pick<
  ShowcaseRepository, "publish" | "reject" | "setPremium" | "setLogoMedia"
>;

export async function publishShowcaseListing(actor: AdminActor, id: string, repository: AdminShowcaseRepository = showcaseRepository) {
  return repository.publish(actor, z.string().min(1).parse(id));
}

export async function rejectShowcaseListing(actor: AdminActor, id: string, reason: string, repository: AdminShowcaseRepository = showcaseRepository) {
  const parsedReason = z.string().trim().min(1).max(1_000).parse(reason);
  return repository.reject(actor, z.string().min(1).parse(id), parsedReason);
}

export async function setShowcasePremium(actor: AdminActor, id: string, premium: boolean, repository: AdminShowcaseRepository = showcaseRepository) {
  return repository.setPremium(actor, z.string().min(1).parse(id), premium);
}

/**
 * Attaching a logo is staff-only and registry-only. The value is a media row
 * id, never a URL, so nothing a member typed can become a rendered image.
 */
export async function setShowcaseLogo(actor: AdminActor, id: string, mediaId: string, repository: AdminShowcaseRepository = showcaseRepository) {
  return repository.setLogoMedia(actor, z.string().min(1).parse(id), mediaId);
}
