"use server";
import {notFound} from "next/navigation";
import {getTranslations} from "next-intl/server";
import type {CompMembershipActionState} from "@/lib/admin/membership-comp-action-core";
import {requireAdminActor} from "@/lib/auth/actor";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
export type CompMembershipActionMessages=Readonly<{successMessage:string;validationMessage:string;errorMessage:string;duplicateMessage:string}>;
/** Stale requests authenticate independently and receive a safe, localized retired result. */
export async function compMembershipAction(_path:string,_messages:CompMembershipActionMessages,_state:CompMembershipActionState,_formData:FormData):Promise<CompMembershipActionState>{
 void _path; void _messages; void _state; void _formData;
 try{
  await requireAdminActor();
  const t=await getTranslations("Admin.membershipComp");
  return {status:"error",code:"LEGACY_COMP_RETIRED",message:t("retired")};
 }catch(error){if(isAuthorizationDenial(error))notFound();throw error;}
}
