"use server";

import {revalidatePath} from "next/cache";

import {updateCompany, updateProfile} from "@/lib/portal/command-core";

// Only formData wrappers are exported here; each resolves its own actor.
export type {
  CompanyUpdateInput,
  PortalActionState,
  PortalCommandDependencies,
  ProfileUpdateInput,
} from "@/lib/portal/command-core";

export async function updateProfileAction(formData: FormData): Promise<void> {
  const {requireActor} = await import("@/lib/auth/actor");
  const actor = await requireActor();
  await updateProfile(actor, {
    displayName: String(formData.get("displayName") ?? ""),
    phone: String(formData.get("phone") ?? "").trim() || null,
    jobTitle: String(formData.get("jobTitle") ?? "").trim() || null,
    locale: String(formData.get("locale") ?? "en") as "en" | "zh-HK",
    directoryVisible: formData.get("directoryVisible") === "on",
  });
  revalidatePath("/portal");

}

export async function updateCompanyAction(formData: FormData): Promise<void> {
  const {requireActor} = await import("@/lib/auth/actor");
  const actor = await requireActor();
  await updateCompany(actor, {
    companyId: String(formData.get("companyId") ?? ""),
    legalName: String(formData.get("legalName") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    website: String(formData.get("website") ?? "").trim() || null,
    industry: String(formData.get("industry") ?? "").trim() || null,
    sizeBand: String(formData.get("sizeBand") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    directoryVisible: formData.get("directoryVisible") === "on",
  });
  revalidatePath("/portal");
  revalidatePath("/portal/company");

}

