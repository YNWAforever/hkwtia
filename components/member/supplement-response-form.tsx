"use client";
import {useRef, useState} from "react";
import {newAttemptId} from "@/lib/random-id";
import type {SupplementResult} from "@/lib/membership/supplement-service";
export type SupplementView = {id: string; version: number; dueAt: string | null; items: readonly {itemId: string; label: string; required: boolean; description?: string}[]};
export type SupplementLabels = Record<"preview" | "visible" | "publish" | "respond" | "text" | "url" | "due" | "saved" | "validation" | "forbidden" | "conflict" | "unknown" | "receipt", string>;
export type SupplementMutation = (input: {requestId: string; expectedVersion: number; operationRequestId: string; answers?: readonly {itemId: string; text: string; url?: string}[]}) => Promise<SupplementResult>;
export type SupplementFormProps = {request: SupplementView; labels: SupplementLabels; action: SupplementMutation; initialOperationRequestId?: string};
/** Offline composition only. A runtime wrapper must project the read and bind an authenticated Server Action. */
export function SupplementEditor({request, labels, action, initialOperationRequestId, preview = false}: SupplementFormProps & {preview?: boolean}) {
 const [answers, setAnswers] = useState(request.items.map(item => ({itemId:item.itemId, text:"", url:""})));
 const [result, setResult] = useState<SupplementResult | null>(null);
 const [busy, setBusy] = useState(false);
 const lock = useRef(false);
 const operation = useRef(initialOperationRequestId);
 const alert = useRef<HTMLParagraphElement>(null);
 const frozen = busy || result?.status === "saved" || result?.status === "unknown" || result?.status === "conflict" || result?.status === "forbidden";
 async function submit(event: React.FormEvent) {
  event.preventDefault();
  if(lock.current || frozen) return;
  lock.current = true; setBusy(true);
  const operationRequestId = operation.current ??= newAttemptId();
  let next: SupplementResult;
  try { next = await action({requestId:request.id, expectedVersion:request.version, operationRequestId, ...(!preview ? {answers:answers.map(({itemId,text,url})=>({itemId,text,...(url ? {url} : {})}))} : {})}); }
  catch { next = {status:"unknown",operationRequestId}; }
  if(next.status === "validation") operation.current = undefined;
  setResult(next); setBusy(false); lock.current=false;
  if(next.status !== "saved") requestAnimationFrame(()=>alert.current?.focus());
 }
 return <form onSubmit={submit} noValidate className="min-w-0 space-y-4 break-words">
  <p>{labels.visible}</p>
  {preview ? <h2>{labels.preview}</h2> : null}
  {request.dueAt ? <p>{labels.due}: <time dateTime={request.dueAt}>{request.dueAt}</time></p> : null}
  {request.items.map((item,index)=><fieldset key={item.itemId} disabled={frozen} className="min-w-0 space-y-2">
   <legend>{item.label}</legend>{item.description ? <p>{item.description}</p>:null}
   {!preview ? <>
    <label className="block">{labels.text}: {item.label}<textarea className="block w-full border p-2" aria-required={item.required} maxLength={2000} value={answers[index].text} onChange={event=>setAnswers(rows=>rows.map((row,i)=>i===index?{...row,text:event.target.value}:row))}/></label>
    <label className="block">{labels.url}: {item.label}<input className="block w-full border p-2" type="url" maxLength={2048} value={answers[index].url} onChange={event=>setAnswers(rows=>rows.map((row,i)=>i===index?{...row,url:event.target.value}:row))}/></label>
   </>:null}
  </fieldset>)}
  <button className="min-h-11 rounded border px-4 focus-visible:outline-2" disabled={frozen} type="submit">{preview?labels.publish:labels.respond}</button>
  {result ? <>
   <p ref={alert} tabIndex={-1} role={result.status==="saved"?"status":"alert"}>{labels[result.status]}</p>
   {"operationRequestId" in result ? <p>{labels.receipt}: {result.operationRequestId}</p>:null}
  </>:null}
 </form>;
}
export function SupplementResponseForm(props: SupplementFormProps) { return <SupplementEditor {...props}/>; }
