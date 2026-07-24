import type {DashboardMembership} from "@/lib/portal/queries";

type Props = Readonly<{
  memberships: readonly DashboardMembership[];
  labels: Readonly<{manage: string; recover: string; empty: string; plan: (code: string) => string; status: (value: string) => string}>;
  actions: Readonly<Record<string, () => Promise<void>>>;
}>;

export function BillingActions({memberships, labels, actions}: Props) {
  const actionable = memberships.filter((membership) => membership.status === "active" || membership.status === "past_due" || membership.status === "cancel_at_period_end" || membership.status === "pending_payment");
  if (actionable.length === 0) return <section className="glass-card p-6"><p className="text-muted-foreground">{labels.empty}</p></section>;

  return (
    <div className="grid gap-4">
      {actionable.map((membership) => {
        const recovery = membership.status === "pending_payment" || membership.status === "past_due";
        const action = actions[membership.id];
        return (
          <article className="glass-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" key={membership.id}>
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-muted-foreground">{labels.plan(membership.planCode)}</p>
              <p className="mt-1 text-sm text-muted-foreground">{labels.status(membership.status)}</p>
            </div>
            <form action={action}>
              <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90" type="submit">{recovery ? labels.recover : labels.manage}</button>
            </form>
          </article>
        );
      })}
    </div>
  );
}