"use client";

import {useActionState} from "react";
import type {PaymentReconciliationState} from "@/lib/admin/payment-reconciliation-actions";
type Props=Readonly<{
 action:(state:PaymentReconciliationState,data:FormData)=>Promise<PaymentReconciliationState>;
 requestId:string;
 labels:Readonly<{title:string;description:string;event:string;reason:string;paid:string;mismatch:string;retry:string;submit:string;pending:string;processed:string;duplicate:string;error:string}>;
}>;
export function PaymentReconciliationForm({action,requestId,labels}:Props){
 const[state,submit,pending]=useActionState<PaymentReconciliationState,FormData>(action,{status:"idle"});
 return <section className="glass-card space-y-4 p-6"><h2 className="font-serif text-2xl">{labels.title}</h2><p className="max-w-3xl text-sm text-muted-foreground">{labels.description}</p>
  <form action={submit} className="space-y-4"><input name="requestId" type="hidden" value={requestId}/>
   <label className="block text-sm" htmlFor="payment-reconcile-event">{labels.event}<input className="mt-2 block min-h-11 w-full rounded-md border px-3" id="payment-reconcile-event" name="eventId" required pattern="evt_[A-Za-z0-9]{6,200}" autoComplete="off"/></label>
   <label className="block text-sm" htmlFor="payment-reconcile-reason">{labels.reason}<select className="mt-2 block min-h-11 rounded-md border px-3" id="payment-reconcile-reason" name="reasonCode"><option value="paid_not_active">{labels.paid}</option><option value="subscription_mismatch">{labels.mismatch}</option><option value="webhook_retry">{labels.retry}</option></select></label>
   {state.status!=="idle"?<p role={state.status==="error"?"alert":"status"}>{labels[state.status]}</p>:null}
   <button className="min-h-11 rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" disabled={pending} type="submit">{pending?labels.pending:labels.submit}</button>
  </form>
 </section>;
}
