"use client";
import {useActionState} from "react";
import type {PartnerActionState} from "@/lib/admin/partner-action-core";
import type {PartnerLifecycleState} from "@/lib/admin/partner-actions";

export type PartnerFormLabels = Record<string, string>;
const fieldClass = "mt-2 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2";
const errorId = (name: string) => `${name}-error`;
function accessibility(state: PartnerActionState, name: string) { const invalid = Boolean(state.fieldErrors?.[name]); return {"aria-invalid": invalid || undefined, "aria-describedby": invalid ? errorId(name) : undefined}; }
function FieldError({state, name}: {state: PartnerActionState; name: string}) { return state.fieldErrors?.[name] ? <span id={errorId(name)}>{state.fieldErrors[name]}</span> : null; }

export function PartnerForm({action, labels, values = {}, mediaRows = []}: {action: (state: PartnerActionState, data: FormData) => Promise<PartnerActionState>; labels: PartnerFormLabels; values?: Record<string, unknown>; mediaRows?: readonly {id: string; altEn: string; altZh: string}[]}) {
  const [state, formAction, pending] = useActionState(action, {});
  const value = (name: string) => state.values?.[name] ?? String(values[name] ?? "");
  const checked = (name: string) => state.values ? state.values[name] === "on" : Boolean(values[name]);
  return <form action={formAction} className="glass-card grid gap-4 p-6 md:grid-cols-2" noValidate>
    {[["nameEn", labels.nameEn], ["nameZhHk", labels.nameZhHk], ["websiteUrl", labels.websiteUrl], ["relationshipStartsOn", labels.relationshipStartsOn], ["relationshipEndsOn", labels.relationshipEndsOn]].map(([name, label]) => <label className="text-sm font-semibold" key={name}>{label}<input {...accessibility(state, name)} className={fieldClass} defaultValue={value(name)} name={name} type={name.includes("On") ? "date" : "text"}/><FieldError name={name} state={state}/></label>)}
    <label>{labels.category}<select {...accessibility(state, "category")} className={fieldClass} defaultValue={value("category") || "supporting"} name="category">{["supporting", "media", "regional", "programme", "sponsor"].map((item) => <option key={item} value={item}>{labels[`category_${item}`]}</option>)}</select><FieldError name="category" state={state}/></label>
    <label>{labels.logoMediaId}<select {...accessibility(state, "logoMediaId")} className={fieldClass} defaultValue={value("logoMediaId")} name="logoMediaId"><option value="">{labels.noLogo}</option>{mediaRows.map((row) => <option key={row.id} value={row.id}>{row.altEn} / {row.altZh}</option>)}</select><FieldError name="logoMediaId" state={state}/></label>
    <label>{labels.displayOrder}<input {...accessibility(state, "displayOrder")} className={fieldClass} defaultValue={value("displayOrder") || "0"} max={10000} min={0} name="displayOrder" type="number"/><FieldError name="displayOrder" state={state}/></label>
    {[["featured", labels.featured], ["relationshipConfirmed", labels.relationshipConfirmed], ["logoRightsConfirmed", labels.logoRightsConfirmed]].map(([name, label]) => <label className="flex flex-wrap items-center gap-2" key={name}><input {...accessibility(state, name)} defaultChecked={checked(name)} name={name} type="checkbox"/>{label}<FieldError name={name} state={state}/></label>)}
    <button className="rounded-md bg-primary px-4 py-2 text-primary-foreground" disabled={pending} type="submit">{pending ? labels.saving : labels.save}</button>
    {state.message ? <p aria-live={state.status === "success" ? "polite" : undefined} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
  </form>;
}

export function PartnerLifecycleControls({publishAction, archiveAction, published, archived, labels}: {publishAction: (state: PartnerLifecycleState, data: FormData) => Promise<PartnerLifecycleState>; archiveAction: (state: PartnerLifecycleState, data: FormData) => Promise<PartnerLifecycleState>; published: boolean; archived: boolean; labels: PartnerFormLabels}) {
  const [publishState, publish, publishing] = useActionState(publishAction, {status: "idle"} as PartnerLifecycleState);
  const [archiveState, archive, archiving] = useActionState(archiveAction, {status: "idle"} as PartnerLifecycleState);
  const lifecycleMessage = (status: PartnerLifecycleState["status"]) => status === "invalid" ? labels.invalid : status === "error" ? labels.error : null;
  return <section className="glass-card flex flex-wrap gap-4 p-6">
    <form action={publish}><button disabled={publishing || (!published && archived)}>{publishing ? labels.saving : published ? labels.unpublish : labels.publish}</button>{lifecycleMessage(publishState.status) ? <span role="alert">{lifecycleMessage(publishState.status)}</span> : null}</form>
    <form action={archive}><button disabled={archiving || (!archived && published)}>{archiving ? labels.saving : archived ? labels.unarchive : labels.archive}</button>{lifecycleMessage(archiveState.status) ? <span role="alert">{lifecycleMessage(archiveState.status)}</span> : null}</form>
  </section>;
}
