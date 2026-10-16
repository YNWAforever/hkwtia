"use server";

import {revalidatePath} from "next/cache";
import {requireActor} from "@/lib/auth/actor";
import {reconcileMembershipPayment,paymentReconciliationSchema} from "@/lib/admin/payment-reconciliation";
import {localizedPath} from "@/lib/urls";
import type {AppLocale} from "@/i18n/routing";
export type PaymentReconciliationState=Readonly<{status:"idle"|"processed"|"duplicate"|"error"}>;
export async function reconcileMembershipPaymentAction(profileId:string,membershipId:string,locale:AppLocale,_previous:PaymentReconciliationState,formData:FormData):Promise<PaymentReconciliationState>{
 const actor=await requireActor();
 const parsed=paymentReconciliationSchema.safeParse({requestId:formData.get("requestId"),eventId:formData.get("eventId"),reasonCode:formData.get("reasonCode")});
 if(!parsed.success)return {status:"error"};
 try{
  const status=await reconcileMembershipPayment(actor,profileId,membershipId,parsed.data);
  revalidatePath(localizedPath(locale,"/admin/members/"+encodeURIComponent(profileId)));
  return {status};
 }catch{return {status:"error"};}
}
