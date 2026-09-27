"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";
import type {AppLocale} from "@/i18n/routing";
import {prepareAdminBatchAction} from "@/lib/admin/batches/actions";
import type {CommunicationTargets} from "@/lib/db/repos/batch-handlers/communication";
import {localizedPath} from "@/lib/urls";

export type CommunicationLabels = Readonly<{operation:string;renewal:string;invite:string;channel:string;email:string;whatsapp:string;help:string;selectAll:string;selectAllMatching:string;selected:string;previous:string;next:string;name:string;scope:string;date:string;preview:string;error:string;empty:string;planCodes:Readonly<Record<string,string>>}>;
export function MemberCommunicationForm({locale,segmentId,targets,labels}:{locale:AppLocale;segmentId:string;targets:CommunicationTargets;labels:CommunicationLabels}) {
  const router=useRouter();
  const [operation,setOperation]=useState<"renewal_reminder"|"profile_update_invite">("renewal_reminder");
  const [channel,setChannel]=useState<"email"|"whatsapp">("email");
  const [selected,setSelected]=useState<string[]>([]);
  const [page,setPage]=useState(0);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState(false);
  const [attempt,setAttempt]=useState(()=>crypto.randomUUID());
  const renewal=operation==="renewal_reminder";
  const rows=renewal?targets.renewals:targets.members;
  const visibleRows=rows.slice(page*50,(page+1)*50);
  const pageIds=[...new Set(visibleRows.map(row=>row.id))];
  const pageSelected=pageIds.length>0&&pageIds.every(id=>selected.includes(id));
  const reset=()=>{setPage(0);setSelected([]);setAttempt(crypto.randomUUID());setError(false);};
  const toggle=(id:string)=>{setSelected(values=>values.includes(id)?values.filter(value=>value!==id):[...values,id]);setAttempt(crypto.randomUUID());};
  async function prepare() {
    if(pending||!selected.length)return;
    setPending(true);setError(false);
    try {
      const request={operation,idempotencyKey:attempt,payload:{channel,segmentId},...(renewal?{membershipIds:selected}:{selection:{mode:"ids",profileIds:selected}})};
      const result=await prepareAdminBatchAction(request);
      router.push(localizedPath(locale,`/admin/batches/${result.batchId}`));
    } catch {setError(true);} finally {setPending(false);}
  }
  return <section className="space-y-4">
    <p className="text-muted-foreground">{labels.help}</p>
    <div className="flex flex-wrap gap-4"><label className="grid gap-1">{labels.operation}<select className="min-h-11 rounded border p-2" disabled={pending} value={operation} onChange={event=>{setOperation(event.target.value as typeof operation);reset();}}><option value="renewal_reminder">{labels.renewal}</option><option value="profile_update_invite">{labels.invite}</option></select></label><label className="grid gap-1">{labels.channel}<select className="min-h-11 rounded border p-2" disabled={pending} value={channel} onChange={event=>{setChannel(event.target.value as typeof channel);setAttempt(crypto.randomUUID());}}><option value="email">{labels.email}</option><option value="whatsapp">{labels.whatsapp}</option></select></label></div>
    {rows.length?<><label className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" disabled={pending} checked={pageSelected} onChange={()=>{setSelected(pageSelected?selected.filter(id=>!pageIds.includes(id)):[...new Set([...selected,...pageIds])]);setAttempt(crypto.randomUUID());}}/>{labels.selectAll}</label><p role="status">{labels.selected.replace("{count}",String(selected.length))}</p>{rows.length>50?<button className="min-h-11 rounded border px-3" disabled={pending} onClick={()=>{setSelected([...new Set(rows.map(row=>row.id))]);setAttempt(crypto.randomUUID());}} type="button">{labels.selectAllMatching}</button>:null}<div className="max-h-[32rem] overflow-auto rounded border"><table className="min-w-full text-left text-sm"><thead><tr><th className="p-3" scope="col">{labels.name}</th>{renewal?<><th className="p-3" scope="col">{labels.scope}</th><th className="p-3" scope="col">{labels.date}</th></>:null}</tr></thead><tbody>{visibleRows.map((row,index)=><tr className="border-t" key={`${row.id}:${index}`}><th className="p-3" scope="row"><label className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" checked={selected.includes(row.id)} disabled={pending} onChange={()=>toggle(row.id)}/>{row.name}</label></th>{"planCode" in row?<><td className="p-3">{row.scope} · {labels.planCodes[row.planCode]??row.planCode}</td><td className="p-3">{row.renewalAt?new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeZone:"Asia/Hong_Kong"}).format(new Date(row.renewalAt)):"—"}</td></>:null}</tr>)}</tbody></table></div><nav className="flex gap-3" aria-label={labels.name}>{page>0?<button className="min-h-11 rounded border px-3" disabled={pending} onClick={()=>setPage(value=>value-1)} type="button">{labels.previous}</button>:null}{(page+1)*50<rows.length?<button className="min-h-11 rounded border px-3" disabled={pending} onClick={()=>setPage(value=>value+1)} type="button">{labels.next}</button>:null}</nav><button className="min-h-11 rounded bg-primary px-4 text-primary-foreground disabled:opacity-50" disabled={pending||!selected.length||selected.length>5000} onClick={prepare} type="button">{labels.preview}</button></>:<p>{labels.empty}</p>}
    {error?<p role="alert" className="text-destructive">{labels.error}</p>:null}
  </section>;
}
