"use server";

import {revalidatePath} from "next/cache";
import {z} from "zod";

import {requireActor} from "@/lib/auth/actor";
import {showcaseRepository, type ShowcaseRepository} from "@/lib/db/repos/showcase";
import type {Actor} from "@/lib/membership/lifecycle";

export type AdminShowcaseRepository = Pick<ShowcaseRepository, "publish" | "reject" | "setPremium">;

export async function publishShowcaseListing(actor: Actor, id: string, repository: AdminShowcaseRepository = showcaseRepository) {
  return repository.publish(actor as never, z.string().min(1).parse(id));
}

export async function rejectShowcaseListing(actor: Actor, id: string, reason: string, repository: AdminShowcaseRepository = showcaseRepository) {
  const parsedReason = z.string().trim().min(1).max(1_000).parse(reason);
  return repository.reject(actor as never, z.string().min(1).parse(id), parsedReason);
}

export async function setShowcasePremium(actor: Actor, id: string, premium: boolean, repository: AdminShowcaseRepository = showcaseRepository) {
  return repository.setPremium(actor as never, z.string().min(1).parse(id), premium);
}

export async function publishShowcaseListingAction(path: string, formData: FormData): Promise<void> {
  const actor = await requireActor();
  await publishShowcaseListing(actor, String(formData.get("listingId") ?? ""));
  revalidatePath(path);
  revalidatePath("/showcase");
}

export async function rejectShowcaseListingAction(path: string, formData: FormData): Promise<void> {
  const actor = await requireActor();
  await rejectShowcaseListing(actor, String(formData.get("listingId") ?? ""), String(formData.get("rejectionReason") ?? ""));
  revalidatePath(path);
  revalidatePath("/showcase");
}

export async function setShowcasePremiumAction(path: string, formData: FormData): Promise<void> {
  const actor = await requireActor();
  await setShowcasePremium(actor, String(formData.get("listingId") ?? ""), formData.get("premium") === "on");
  revalidatePath(path);
  revalidatePath("/showcase");
}
