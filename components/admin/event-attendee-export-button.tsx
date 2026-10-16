"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {prepareAdminBatchAction} from "@/lib/admin/batches/actions";
import {localizedPath} from "@/lib/urls";
import type {AppLocale} from "@/i18n/routing";
export function EventAttendeeExportButton({eventId,search,locale,label,errorLabel}:{eventId:string;search:string;locale:AppLocale;label:string;errorLabel:string}){
 const router=useRouter(),[pending,setPending]=useState(false),[failed,setFailed]=useState(false),[attempt]=useState(()=>crypto.randomUUID());
 async function prepare(){setPending(true);setFailed(false);try{const {batchId}=await prepareAdminBatchAction({operation:'export_event_attendees',idempotencyKey:attempt,payload:{eventId,search}});router.push(localizedPath(locale,`/admin/batches/${batchId}`));}catch{setFailed(true);setPending(false);}}
 return <div><button className="min-h-11 rounded-md border px-3 text-primary disabled:opacity-50" disabled={pending} onClick={prepare} type="button">{label}</button>{failed?<p role="alert" className="text-sm text-destructive">{errorLabel}</p>:null}</div>;
}
