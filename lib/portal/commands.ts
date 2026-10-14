"use server";

import {revalidatePath} from "next/cache";

import {companyDirectoryVisibility, updateCompany, updateProfile} from "@/lib/portal/command-core";
import {portalFormError} from "@/lib/portal/form-error";
import type {PortalFormState} from "@/lib/portal/form-state";

// Only formData wrappers are exported here; each resolves its own actor.
export type {
  CompanyUpdateInput,
  PortalActionState,
  PortalCommandDependencies,
  ProfileUpdateInput,
} from "@/lib/portal/command-core";

export async function updateProfileAction(_state: PortalFormState, formData: FormData): Promise<PortalFormState> {
  const {requireActor} = await import("@/lib/auth/actor");
  const actor = await requireActor();
  try { await updateProfile(actor, {
    displayName: String(formData.get("displayName") ?? ""),
    phone: String(formData.get("phone") ?? "").trim() || null,
    jobTitle: String(formData.get("jobTitle") ?? "").trim() || null,
    locale: String(formData.get("locale") ?? "en") as "en" | "zh-HK",
    directoryVisible: formData.get("directoryVisible") === "on",
    whatsappNumber: String(formData.get("whatsappNumber") ?? "").trim() || null,
    whatsappOptIn: formData.get("whatsappOptIn") === "on",
  }); } catch (error) { return portalFormError(error); }
  for (const locale of ["en", "zh-HK"]) {
    revalidatePath(`/${locale}/portal`);
    revalidatePath(`/${locale}/portal/profile`);
  }
  return {status: "success"};
}

export async function updateCompanyAction(_state: PortalFormState, formData: FormData): Promise<PortalFormState> {
  const {requireActor} = await import("@/lib/auth/actor");
  const actor = await requireActor();
  // Absent unless the form rendered the switch, so a save can never reset it by omission.
  const directoryVisible = companyDirectoryVisibility(formData);
  try { await updateCompany(actor, {
    companyId: String(formData.get("companyId") ?? ""),
    legalName: String(formData.get("legalName") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    website: String(formData.get("website") ?? "").trim() || null,
    industry: String(formData.get("industry") ?? "").trim() || null,
    sizeBand: String(formData.get("sizeBand") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    ...(directoryVisible === undefined ? {} : {directoryVisible}),
  }); } catch (error) { return portalFormError(error); }
  for (const locale of ["en", "zh-HK"]) {
    revalidatePath(`/${locale}/portal`);
    revalidatePath(`/${locale}/portal/company`);
  }
  return {status: "success"};
}

