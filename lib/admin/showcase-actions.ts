"use server";

import {revalidatePath} from "next/cache";

import {revalidateAdminPath} from "@/lib/admin/revalidate-path";
import {
  publishShowcaseListing,
  rejectShowcaseListing,
  setShowcaseLogo,
  setShowcasePremium,
} from "@/lib/admin/showcase-core";
import {requireAdminActor} from "@/lib/auth/actor";

// Every export here is an HTTP-callable endpoint, so each one must resolve its
// own actor from the session. The actor-taking cores live in
// lib/admin/showcase-core.ts precisely so they cannot be dispatched directly.
export type {AdminShowcaseRepository} from "@/lib/admin/showcase-core";

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

export async function setShowcaseLogoAction(path: string, formData: FormData): Promise<void> {
  const actor = await requireAdminActor();
  await setShowcaseLogo(actor, String(formData.get("listingId") ?? ""), String(formData.get("logoMediaId") ?? ""));
  revalidateAdminPath(path);
  revalidatePath("/showcase");
}
