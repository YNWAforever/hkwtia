"use server";

import {revalidatePath} from "next/cache";

import {requireActor} from "@/lib/auth/actor";
import {saveShowcaseDraft, submitShowcaseListing} from "@/lib/showcase/member-core";
import {listingInputFromFormData} from "@/lib/showcase/member-contract";

// Only formData wrappers are exported here; each resolves its own actor.
export type {MemberShowcaseRepository} from "@/lib/showcase/member-core";

function textField(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

export async function saveShowcaseDraftAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  await saveShowcaseDraft(actor, textField(formData, "companyId"), listingInputFromFormData(formData));
  revalidatePath("/portal/company/listing");
  revalidatePath("/showcase");
}

export async function submitShowcaseListingAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  await submitShowcaseListing(actor, textField(formData, "companyId"), listingInputFromFormData(formData));
  revalidatePath("/portal/company/listing");
  revalidatePath("/showcase");
}
