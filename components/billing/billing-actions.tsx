import {HonestEmpty} from "@/components/wt/honest-empty";
import {StatusLabel} from "@/components/wt/status-label";
import type {BillingPeriodLine} from "@/lib/portal/billing-period";
import type {BillingMembershipSummary} from "@/lib/portal/billing-summary";

export type BillingDetail = Readonly<{period: BillingPeriodLine | null; seatLimit: number | null}>;

type Props = Readonly<{
  memberships: readonly BillingMembershipSummary[];
  labels: Readonly<{
    manage: string; manageHelp: string; recover: string; history: string; support: string; supportMessage: string;
    providerUnavailable: string; pastDue: string; empty: string; emptyCopy: string; emptyAction: string;
    plan: (code: string) => string; status: (value: string) => string;
    renewsOn: (date: Date) => string; endsOn: (date: Date) => string; seats: (count: number) => string;
  }>;
  supportHref: string;
  membershipHref: string;
  actions: Readonly<Record<string, () => Promise<void>>>;
  details: Readonly<Record<string, BillingDetail>>;
}>;

export function BillingActions({memberships, labels, supportHref, membershipHref, actions, details}: Props) {
  if (memberships.length === 0) {
    // The link sits beside the block, not in its `actions`: ActionLink localizes its href itself, and ours is already localized.
    return (
      <>
        <HonestEmpty variant="inner" title={labels.empty} copy={labels.emptyCopy} />
        <p><a className="text-link" href={membershipHref}>{labels.emptyAction}</a></p>
      </>
    );
  }
  return (
    <div className="portal-card-grid">
      {memberships.map((membership) => {
        const action = actions[membership.id];
        const needsSupport = membership.recovery === "support";
        const detail = details[membership.id];
        const period = detail?.period ?? null;
        const manages = Boolean(action) && !needsSupport && membership.recovery !== "new_checkout";
        return (
          <article className="portal-card portal-billing-card" key={membership.id}>
            <StatusLabel>{labels.status(membership.status)}</StatusLabel>
            <h2>{labels.plan(membership.planCode)}</h2>
            {period ? <p>{period.kind === "ends" ? labels.endsOn(period.date) : labels.renewsOn(period.date)}</p> : null}
            {detail?.seatLimit ? <p>{labels.seats(detail.seatLimit)}</p> : null}
            {membership.status === "past_due" ? <p className="portal-form-alert">{labels.pastDue}</p> : null}
            {needsSupport ? <p>{labels.supportMessage}</p> : null}
            {!membership.providerAvailable ? <p className="portal-billing-muted" role="status">{labels.providerUnavailable}</p> : null}
            <div className="portal-billing-actions">
              {action ? <form action={action}><button className="button" type="submit">{membership.recovery === "new_checkout" ? labels.recover : needsSupport ? labels.history : labels.manage}</button></form> : null}
              {manages ? <p className="portal-billing-muted">{labels.manageHelp}</p> : null}
              {needsSupport ? <a className="text-link" href={supportHref}>{labels.support}</a> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
