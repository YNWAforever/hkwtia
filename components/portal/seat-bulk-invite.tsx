"use client";
import {startTransition, useActionState, useEffect, useRef, type FormEvent} from "react";
import {PrivateLink} from "@/components/internal-shell/private-link";
import {seatBulkAction} from "@/lib/portal/seat-bulk-actions";
import type {SeatBatchView, SeatBulkState} from "@/lib/portal/seat-bulk-contract";

export type SeatBulkLabels = Readonly<{
  title: string; help: string; rows: string; preview: string; commit: string; continue: string; retry: string; refresh: string; pending: string;
  selection: string; capacity: string; confirmElevated: string; reference: string; creatorOnly: string; uncertainty: string; support: string;
  cancel: string; cancelConfirm: string;
  roles: Record<"member" | "admin" | "owner", string>; states: Record<string, string>; codes: Record<string, string>; errors: Record<string, string>;
}>;
export function SeatBulkInvite({companyId, locale, labels, initialView, supportHref}: Readonly<{
  companyId: string; locale: string; labels: SeatBulkLabels; initialView?: SeatBatchView; supportHref: string;
}>) {
  const [state, dispatch, pending] = useActionState<SeatBulkState, FormData>(seatBulkAction, initialView ? {status: "ready", view: initialView} : {status: "idle"});
  const submitting = useRef(false);
  const view = state.status === "ready" ? state.view : state.status === "error" ? state.view : initialView;
  useEffect(() => {
    if (!pending) submitting.current = false;
    if (state.status === "ready") {
      const url = new URL(window.location.href);
      url.searchParams.set("companyId", state.view.companyId); url.searchParams.set("batchId", state.view.batchId);
      if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
    }
  }, [state, pending]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const data = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter instanceof HTMLButtonElement && submitter.name) data.set(submitter.name, submitter.value);
    if (data.get("operation") === "cancel" && !window.confirm(labels.cancelConfirm)) return;
    submitting.current = true;
    startTransition(() => dispatch(data));
  }
  let selectedByDefault = 0;
  return <section className="portal-seat-section space-y-4">
    <h2>{labels.title}</h2><p>{labels.help}</p>
    <form action={dispatch} onSubmit={submit} className="portal-form">
      <input type="hidden" name="companyId" value={companyId}/><input type="hidden" name="locale" value={locale}/><input type="hidden" name="operation" value="preview"/>
      <label htmlFor="seat-bulk-rows">{labels.rows}</label><textarea id="seat-bulk-rows" name="rows" rows={5} maxLength={20_000} required/>
      <button className="button" type="submit" disabled={pending}>{pending ? labels.pending : labels.preview}</button>
    </form>
    {state.status === "error" ? <p role="alert" className="portal-form-alert">{labels.errors[state.code]}</p> : null}
    {view ? <form action={dispatch} onSubmit={submit} className="portal-form" key={view.batchId}>
      <input type="hidden" name="companyId" value={view.companyId}/><input type="hidden" name="batchId" value={view.batchId}/><input type="hidden" name="requestId" value={view.batchId}/>
      <p>{labels.reference.replace("{id}", view.batchId)}</p><p>{labels.capacity.replace("{count}", String(view.available))}</p>
      {view.state === "preview" ? <p>{labels.selection}</p> : null}
      {!view.canCommit ? <p>{labels.creatorOnly}</p> : null}
      <ol className="space-y-3">{view.items.map((item) => {
        const eligible = item.state === "preview";
        const checked = eligible && selectedByDefault++ < view.available;
        return <li key={item.itemId} className="portal-card break-words">
          <label>{view.state === "preview" ? <input type="checkbox" name="itemId" value={item.itemId} defaultChecked={checked} disabled={!eligible || !view.canCommit || pending}/> : null} {item.email} — {labels.roles[item.role]}</label>
          <p role="status">{labels.states[item.state]}</p>
          {item.code ? <p>{labels.codes[item.code] ?? labels.errors.unavailable}</p> : null}
        </li>;
      })}</ol>
      {view.state === "preview" && view.items.some((item) => item.state === "preview" && item.role !== "member") ? <label><input type="checkbox" name="confirmElevated" disabled={pending}/>{labels.confirmElevated}</label> : null}
      <div className="flex flex-wrap gap-3">
        {view.state === "preview" && view.canCommit ? <button className="button" name="operation" value="commit" disabled={pending} type="submit">{labels.commit}</button> : null}
        {view.state === "committed" && view.canCommit && view.items.some((item) => ["pending", "delivery_pending"].includes(item.state)) ? <button className="button" name="operation" value="continue" disabled={pending} type="submit">{labels.continue}</button> : null}
        {view.state === "committed" && view.canCommit && view.items.some((item) => item.retryable) ? <button className="button" name="operation" value="retry" disabled={pending} type="submit">{labels.retry}</button> : null}
        {view.state === "committed" && view.canCommit && view.items.some((item) => ["pending", "delivery_pending"].includes(item.state)) ? <button className="portal-button-outline" name="operation" value="cancel" disabled={pending} type="submit">{labels.cancel}</button> : null}
        <button className="portal-button-outline" name="operation" value="refresh" disabled={pending} type="submit">{labels.refresh}</button>
      </div>
    </form> : null}
    {view?.items.some((item) => item.state === "uncertain") ? <p role="status">{labels.uncertainty}</p> : null}
    <PrivateLink className="text-link" href={supportHref}>{labels.support}</PrivateLink>
  </section>;
}
