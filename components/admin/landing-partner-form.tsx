"use client";
import {useActionState} from "react";
import type {PartnerActionState} from "@/lib/admin/partner-action-core";
import {PartnerLifecycleControls} from "@/components/admin/partner-form";
export {PartnerLifecycleControls};

const fieldClass = "mt-2 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2";
const errorId = (name: string) => `${name}-error`;
function accessibility(state: PartnerActionState, name: string) { const invalid = Boolean(state.fieldErrors?.[name]); return {"aria-invalid": invalid || undefined, "aria-describedby": invalid ? errorId(name) : undefined}; }
function FieldError({state, name}: {state: PartnerActionState; name: string}) { return state.fieldErrors?.[name] ? <span id={errorId(name)}>{state.fieldErrors[name]}</span> : null; }

export function LandingPartnerForm({action, labels, values = {}}: {action: (state: PartnerActionState, data: FormData) => Promise<PartnerActionState>; labels: Record<string, string>; values?: Record<string, unknown>}) {
  const [state, formAction, pending] = useActionState(action, {});
  const value = (name: string) => state.values?.[name] ?? String(values[name] ?? "");
  return <form action={formAction} className="glass-card grid gap-4 p-6 md:grid-cols-2" noValidate>
    {[["organizationEn", labels.organizationEn], ["organizationZhHk", labels.organizationZhHk], ["market", labels.market], ["region", labels.region]].map(([name, label]) => <label key={name}>{label}<input {...accessibility(state, name)} className={fieldClass} defaultValue={value(name)} name={name}/><FieldError name={name} state={state}/></label>)}
    <label>{labels.mouStatus}<select {...accessibility(state, "mouStatus")} className={fieldClass} defaultValue={value("mouStatus") || "prospect"} name="mouStatus">{["prospect", "in_discussion", "signed", "inactive"].map((item) => <option key={item} value={item}>{labels[`mou_${item}`]}</option>)}</select><FieldError name="mouStatus" state={state}/></label>
    <label>{labels.contactJson}<textarea {...accessibility(state, "contactJson")} className={fieldClass} defaultValue={state.values?.contactJson ?? JSON.stringify(values.contact ?? {}, null, 2)} name="contactJson"/><FieldError name="contactJson" state={state}/></label>
    <label className="md:col-span-2">{labels.notes}<textarea {...accessibility(state, "notes")} className={fieldClass} defaultValue={value("notes")} name="notes"/><FieldError name="notes" state={state}/></label>
    <button disabled={pending} type="submit">{pending ? labels.saving : labels.save}</button>
    {state.message ? <p aria-live={state.status === "success" ? "polite" : undefined} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
  </form>;
}
