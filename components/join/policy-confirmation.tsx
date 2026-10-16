import type { PolicyConfirmationView } from "@/lib/membership/policy-view";
type Props = Readonly<{
    view: PolicyConfirmationView;
    supportHref: string;
    labels: Readonly<{
        title: string;
        version: string;
        accept: string;
        accepted: string;
        unavailable: string;
        ownerRequired: string;
        support: string;
    }>;
}>;
export function PolicyConfirmation({ view, supportHref, labels }: Props) {
    if (!view.enabled)
        return null;
    return <section className="space-y-4 rounded-md border border-border p-4" aria-label={labels.title}>
  <h2 className="font-serif text-xl">{labels.title}</h2>
  {view.policy ? <><p className="text-sm text-muted-foreground">{labels.version} {view.policy.version}</p><div className="max-h-80 overflow-auto whitespace-pre-wrap text-sm" role="region" aria-label={labels.title} tabIndex={0}>{view.policy.content}</div></> : <p role="alert">{labels.unavailable}</p>}
  {view.needsAcceptance && view.policy ? <><input name="policyVersion" type="hidden" value={view.policy.version}/><label className="flex items-start gap-3 text-sm" htmlFor="policyAccepted"><input id="policyAccepted" name="policyAccepted" required type="checkbox" className="mt-1"/>{labels.accept}</label></> : view.policy && view.canProceed ? <p className="text-sm" role="status">{labels.accepted}</p> : null}
  {view.ownerRequired ? <p role="alert">{labels.ownerRequired}</p> : null}
  {!view.canProceed ? <a className="inline-flex min-h-11 items-center text-primary underline" href={supportHref}>{labels.support}</a> : null}
 </section>;
}
