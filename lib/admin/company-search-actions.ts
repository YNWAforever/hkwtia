"use server";
import { requireAdminActor } from "@/lib/auth/actor";
import { searchAdminCompanies } from "@/lib/db/repos/companies";
export async function searchAdminCompanyOptionsAction(search: string) {
  const actor = await requireAdminActor();
  try {
    return {
      status: "success" as const,
      items: await searchAdminCompanies(actor, { search }),
    };
  } catch {
    return { status: "error" as const };
  }
}
