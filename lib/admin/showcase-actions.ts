"use server";

import {revalidatePath} from "next/cache";
import {z} from "zod";

import {revalidateAdminPath} from "@/lib/admin/revalidate-path";
import {requireAdminActor} from "@/lib/auth/actor";
import {showcaseRepository, type ShowcaseRepository} from "@/lib/db/repos/showcase";
import type {AdminActor} from "@/lib/membership/lifecycle";

export type AdminShowcaseRepository = Pick<ShowcaseRepository, "publish" | "reject" | "setPremium">;

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

export async function publishShowcaseListingAction(path: string, formData: FormData): Promise<void> {
  const actor = await requireAdminActor();
  await publishShowcaseListing(actor, String(formData.get("listingId") ?? ""));
  revalidateAdminPath(path);
  revalidatePath("/showcase");
}

export async function rejectShowcaseListingAction(path: string, formData: FormData): Promise<void> {
  const actor = await requireAdminActor();
  await rejectShowcaseListing(actor, String(formData.get("listingId") ?? ""), String(formData.get("rejectionReason") ?? ""));
  revalidateAdminPath(path);
  revalidatePath("/showcase");
}

export async function setShowcasePremiumAction(path: string, formData: FormData): Promise<void> {
  const actor = await requireAdminActor();
  await setShowcasePremium(actor, String(formData.get("listingId") ?? ""), formData.get("premium") === "on");
  revalidateAdminPath(path);
  revalidatePath("/showcase");
}
