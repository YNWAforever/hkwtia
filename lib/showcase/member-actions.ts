"use server";

import {revalidatePath} from "next/cache";

import {requireActor} from "@/lib/auth/actor";
import {showcaseRepository, type ShowcaseRepository} from "@/lib/db/repos/showcase";
import type {Actor} from "@/lib/membership/lifecycle";
import {listingInputFromFormData} from "@/lib/showcase/member-contract";

export type MemberShowcaseRepository = Pick<ShowcaseRepository, "upsertDraft" | "submitForReview">;

function textField(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

export async function saveShowcaseDraft(
  actor: Actor,
  companyId: string,
  rawInput: unknown,
  repository: MemberShowcaseRepository = showcaseRepository,
) {
  return repository.upsertDraft(actor, companyId, rawInput, "draft");
}

export async function submitShowcaseListing(
  actor: Actor,
  companyId: string,
  rawInput: unknown,
  repository: MemberShowcaseRepository = showcaseRepository,
) {
  return repository.submitForReview(actor, companyId, rawInput);
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
