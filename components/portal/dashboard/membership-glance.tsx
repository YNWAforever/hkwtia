import {ActionLink} from '@/components/wt/action-link';
import type {AppLocale} from '@/i18n/routing';

type MembershipGlanceProps = Readonly<{
  locale: AppLocale;
  planLabel: string;
  periodEnd: Date | null;
  endsAtPeriodEnd: boolean;
  seatsValue: string;
  labels: Readonly<{title: string; plan: string; renews: string; ends: string; seats: string; manageSeats: string}>;
}>;

export function MembershipGlance({locale, planLabel, periodEnd, endsAtPeriodEnd, seatsValue, labels}: MembershipGlanceProps) {
  // The date is omitted when the period end is unknown: a missing value must never render as
  // "Invalid Date" or an empty term.
  const date = periodEnd
    ? new Intl.DateTimeFormat(locale, {dateStyle: 'long', timeZone: 'Asia/Hong_Kong'}).format(periodEnd)
    : null;

  return (
    <section className="portal-glance" aria-labelledby="portal-glance-title">
      <h2 id="portal-glance-title">{labels.title}</h2>
      <dl>
        <div>
          <dt>{labels.plan}</dt>
          <dd>{planLabel}</dd>
        </div>
        {date ? (
          <div>
            <dt>{endsAtPeriodEnd ? labels.ends : labels.renews}</dt>
            <dd>{date}</dd>
          </div>
        ) : null}
        <div>
          <dt>{labels.seats}</dt>
          <dd>
            {seatsValue}
            <ActionLink href="/portal/company/seats" variant="text-link">{labels.manageSeats}</ActionLink>
          </dd>
        </div>
      </dl>
    </section>
  );
}
