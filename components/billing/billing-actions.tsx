import type {BillingMembershipSummary} from "@/lib/portal/billing-summary";

type Props = Readonly<{
  memberships: readonly BillingMembershipSummary[];
  labels: Readonly<{manage: string; recover: string; history: string; support: string; supportMessage: string; providerUnavailable: string; empty: string; plan: (code: string) => string; status: (value: string) => string}>;
  supportHref: string;
  actions: Readonly<Record<string, () => Promise<void>>>;
}>;

export function BillingActions({memberships, labels, supportHref, actions}: Props) {
  if (memberships.length === 0) return <section className="glass-card p-6"><p className="text-muted-foreground">{labels.empty}</p><a className="mt-4 inline-flex min-h-11 items-center text-primary underline" href={supportHref}>{labels.support}</a></section>;
  return (
    <div className="grid gap-4">
      {memberships.map((membership) => {
        const action = actions[membership.id];
        const needsSupport = membership.recovery === "support";
        return (
          <article className="glass-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" key={membership.id}>
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-muted-foreground">{labels.plan(membership.planCode)}</p>
              <p className="mt-1 text-sm text-muted-foreground">{labels.status(membership.status)}</p>
              {needsSupport ? <p className="mt-3 max-w-xl text-sm text-muted-foreground">{labels.supportMessage}</p> : null}
              {!membership.providerAvailable ? <p className="mt-2 text-sm text-muted-foreground" role="status">{labels.providerUnavailable}</p> : null}
            </div>
            <div className="flex flex-wrap gap-3">
              {action ? <form action={action}><button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90" type="submit">{membership.recovery === "new_checkout" ? labels.recover : needsSupport ? labels.history : labels.manage}</button></form> : null}
              {needsSupport ? <a className="inline-flex min-h-11 items-center text-primary underline focus-visible:outline" href={supportHref}>{labels.support}</a> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
