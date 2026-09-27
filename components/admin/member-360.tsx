import type {ReactNode} from "react";

import type {AppLocale} from "@/i18n/routing";
import type {Member360} from "@/lib/admin/member-360";
import {TicketResendPreviewButton} from "@/components/admin/ticket-resend-preview-button";

export type Member360Labels = Readonly<{
  profile: string;
  companies: string;
  membership: string;
  allMemberships: string;
  membershipId: string;
  personalMembership: string;
  purchases: string;
  purchaseBuyer: string;
  purchaseAttendees: string;
  purchaseAmount: string;
  refundReason: string;
  refundedAt: string;
  planCodes: Readonly<Record<string, string>>;
  membershipStatuses: Readonly<Record<string, string>>;
  purchaseStatuses: Readonly<Record<string, string>>;
  refundReasons: Readonly<Record<string, string>>;
  engagement: string;
  emails: string;
  events: string;
  notes: string;
  journeys: string;
  whatsapp: string;
  suppressions: string;
  empty: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  plan: string;
  status: string;
  renewal: string;
  score: string;
  trend: string;
  company: string;
  companyRole: string;
  event: string;
  occurredAt: string;
  subject: string;
  emailStatus: string;
  template: string;
  locale: string;
  channel: string;
  classification: string;
  attemptCount: string;
  errorCode: string;
  scheduledAt: string;
  createdAt: string;
  step: string;
  reasonCode: string;
  noteAuthor: string;
  noteCreatedAt: string;
  stripeCustomer: string;
  stripeSubscription: string;
}>;

type Member360ViewProps = Readonly<{
  view: Member360;
  locale: AppLocale;
  labels: Member360Labels;
  stripeCustomerHref: string | null;
  stripeSubscriptionHref: string | null;
  ticketResendLabels?: Readonly<{preview: string; error: string}>;
  activeHistory?: "engagement" | "emails" | "events" | "purchases" | "notes" | "journeys" | "whatsapp" | "suppressions" | null;
}>;

type MemberFieldProps = Readonly<{
  label: string;
  children: ReactNode;
}>;

function MemberField({label, children}: MemberFieldProps) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-foreground">{children}</dd>
    </div>
  );
}

function valueOrEmpty(
  value: string | number | null,
  empty: string,
): string | number {
  return value ?? empty;
}

export function Member360View({
  view,
  locale,
  labels,
  stripeCustomerHref,
  stripeSubscriptionHref,
  ticketResendLabels,
  activeHistory,
}: Member360ViewProps) {
  const moneyFormatter = new Intl.NumberFormat(locale, {style: "currency", currency: "HKD"});
  const dateTimeFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section
        aria-labelledby="member-profile-heading"
        className="glass-card space-y-4 p-5 sm:p-8"
      >
        <h2
          className="font-serif text-2xl font-semibold"
          id="member-profile-heading"
        >
          {labels.profile}
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <MemberField label={labels.name}>
            {view.profile.displayName}
          </MemberField>
          <MemberField label={labels.email}>
            {valueOrEmpty(view.profile.email, labels.empty)}
          </MemberField>
          <MemberField label={labels.phone}>
            {valueOrEmpty(view.profile.phone, labels.empty)}
          </MemberField>
          <MemberField label={labels.role}>{view.profile.role}</MemberField>
        </dl>
      </section>

      <section
        aria-labelledby="member-companies-heading"
        className="glass-card space-y-4 p-5 sm:p-8"
      >
        <h2
          className="font-serif text-2xl font-semibold"
          id="member-companies-heading"
        >
          {labels.companies}
        </h2>
        {view.companies.length === 0 ? (
          <p className="text-sm text-muted-foreground">{labels.empty}</p>
        ) : (
          <ul className="space-y-3">
            {view.companies.map((company) => (
              <li
                className="flex justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0"
                key={company.id}
              >
                <span>{company.name}</span>
                <span className="text-sm text-muted-foreground">
                  {company.role}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="member-membership-heading"
        className="glass-card space-y-4 p-5 sm:p-8"
      >
        <h2
          className="font-serif text-2xl font-semibold"
          id="member-membership-heading"
        >
          {labels.membership}
        </h2>
        {view.membership ? (
          <dl className="grid gap-4 sm:grid-cols-2">
            <MemberField label={labels.plan}>
              {labels.planCodes[view.membership.planCode] ?? view.membership.planCode}
            </MemberField>
            <MemberField label={labels.status}>
              {labels.membershipStatuses[view.membership.status] ?? view.membership.status}
            </MemberField>
            <MemberField label={labels.renewal}>
              {view.membership.renewalAt ? <time dateTime={view.membership.renewalAt}>{dateTimeFormatter.format(new Date(view.membership.renewalAt))}</time> : labels.empty}
            </MemberField>
            <MemberField label={labels.stripeCustomer}>
              {stripeCustomerHref && view.membership.stripeCustomerId ? (
                <a
                  className="text-primary underline-offset-4 hover:underline"
                  href={stripeCustomerHref}
                  rel="noreferrer"
                  target="_blank"
                >
                  {view.membership.stripeCustomerId}
                </a>
              ) : labels.empty}
            </MemberField>
            <MemberField label={labels.stripeSubscription}>
              {stripeSubscriptionHref && view.membership.stripeSubscriptionId ? (
                <a
                  className="text-primary underline-offset-4 hover:underline"
                  href={stripeSubscriptionHref}
                  rel="noreferrer"
                  target="_blank"
                >
                  {view.membership.stripeSubscriptionId}
                </a>
              ) : labels.empty}
            </MemberField>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">{labels.empty}</p>
        )}
        {(view.memberships ?? []).length > 0 && <div className="border-t border-border pt-4">
          <h3 className="font-medium">{labels.allMemberships}</h3>
          <ul className="mt-3 space-y-3">{(view.memberships ?? []).map((item) => <li className="rounded-md border border-border p-3" key={item.id}>
            <p>{item.companyId ? view.companies.find((company) => company.id === item.companyId)?.name ?? item.companyId : labels.personalMembership}</p>
            <p className="text-sm">{labels.planCodes[item.planCode] ?? item.planCode} · {labels.membershipStatuses[item.status] ?? item.status}</p>
            <p className="text-xs text-muted-foreground">{labels.membershipId}: <code>{item.id}</code></p>
          </li>)}</ul>
        </div>}
      </section>

      <section
        aria-labelledby="member-engagement-heading"
        className="glass-card space-y-4 p-5 sm:p-8"
      >
        <h2
          className="font-serif text-2xl font-semibold"
          id="member-engagement-heading"
        >
          {labels.engagement}
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <MemberField label={labels.score}>
            {valueOrEmpty(view.engagement.score, labels.empty)}
          </MemberField>
          <MemberField label={labels.trend}>
            {valueOrEmpty(view.engagement.trend, labels.empty)}
          </MemberField>
        </dl>
        {(activeHistory === undefined || activeHistory === "engagement") && (view.engagement.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{labels.empty}</p>
        ) : (
          <ul className="space-y-3">
            {view.engagement.events.map((event) => (
              <li className="border-t border-border pt-3" key={event.id}>
                <p>{event.type} · {event.points}</p>
                <p className="text-sm text-muted-foreground">
                  <time dateTime={event.occurredAt}>{event.occurredAt}</time>
                </p>
              </li>
            ))}
          </ul>
        ))}
      </section>

      {(activeHistory === undefined || activeHistory === "emails") && <section
        aria-labelledby="member-emails-heading"
        className="glass-card space-y-4 p-5 sm:p-8"
      >
        <h2
          className="font-serif text-2xl font-semibold"
          id="member-emails-heading"
        >
          {labels.emails}
        </h2>
        {view.emails.length === 0 ? (
          <p className="text-sm text-muted-foreground">{labels.empty}</p>
        ) : (
          <ul className="space-y-3">
            {view.emails.map((email) => (
              <li className="border-t border-border pt-3" key={email.id}>
                <p>{email.subject}</p>
                <p className="text-sm text-muted-foreground">
                  {email.template} · {email.status} ·{" "}
                  <time dateTime={email.createdAt}>{email.createdAt}</time>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>}

      {(activeHistory === undefined || activeHistory === "events") && <section
        aria-labelledby="member-events-heading"
        className="glass-card space-y-4 p-5 sm:p-8"
      >
        <h2
          className="font-serif text-2xl font-semibold"
          id="member-events-heading"
        >
          {labels.events}
        </h2>
        {view.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{labels.empty}</p>
        ) : (
          <ul className="space-y-3">
            {view.events.map((event) => (
              <li className="border-t border-border pt-3" key={event.eventId}>
                <p>{event.title}</p>
                <p className="text-sm text-muted-foreground">
                  {event.status} ·{" "}
                  <time dateTime={event.startsAt}>{event.startsAt}</time>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>}

      {(activeHistory === undefined || activeHistory === "purchases") && <section aria-labelledby="member-purchases-heading" className="glass-card space-y-4 p-5 sm:p-8 lg:col-span-2">
        <h2 className="font-serif text-2xl font-semibold" id="member-purchases-heading">{labels.purchases}</h2>
        {(view.purchases ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{labels.empty}</p> : <ul className="space-y-4">
          {(view.purchases ?? []).map((order) => <li className="border-t border-border pt-4" key={order.id}>
            <p className="font-medium">{locale === "zh-HK" ? order.titleZh ?? order.titleEn : order.titleEn}</p>
            <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
              <MemberField label={labels.purchaseBuyer}>{view.profile.displayName}</MemberField>
              <MemberField label={labels.status}>{labels.purchaseStatuses[order.status] ?? order.status}</MemberField>
              <MemberField label={labels.purchaseAmount}>{moneyFormatter.format(order.amountHkdCents / 100)}</MemberField>
              <MemberField label={labels.createdAt}><time dateTime={order.createdAt}>{dateTimeFormatter.format(new Date(order.createdAt))}</time></MemberField>
              {order.refundReason && <MemberField label={labels.refundReason}>{labels.refundReasons[order.refundReason] ?? order.refundReason}</MemberField>}
              {order.refundedAt && <MemberField label={labels.refundedAt}><time dateTime={order.refundedAt}>{dateTimeFormatter.format(new Date(order.refundedAt))}</time></MemberField>}
            </dl>
            <p className="mt-3 text-sm font-medium">{labels.purchaseAttendees}</p>
            <ul className="mt-1 list-inside list-disc text-sm">{order.seats.map((seat) => <li key={seat.id}>{seat.attendeeName}{seat.checkedInAt ? ` · ${dateTimeFormatter.format(new Date(seat.checkedInAt))}` : ""}{ticketResendLabels && order.status === "paid" && !seat.checkedInAt ? <TicketResendPreviewButton seatId={seat.id} locale={locale} label={ticketResendLabels.preview} errorLabel={ticketResendLabels.error}/> : null}</li>)}</ul>
          </li>)}
        </ul>}
      </section>}

      {(activeHistory === undefined || activeHistory === "journeys") && <section
        aria-labelledby="member-journeys-heading"
        className="glass-card space-y-4 p-5 sm:p-8"
      >
        <h2
          className="font-serif text-2xl font-semibold"
          id="member-journeys-heading"
        >
          {labels.journeys}
        </h2>
        {view.journeys.length === 0 ? (
          <p className="text-sm text-muted-foreground">{labels.empty}</p>
        ) : (
          <ul className="space-y-4">
            {view.journeys.map((journey) => (
              <li className="border-t border-border pt-4" key={journey.id}>
                <p className="font-medium">{journey.journey}</p>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <MemberField label={labels.step}>{journey.step}</MemberField>
                  <MemberField label={labels.status}>
                    {journey.status}
                  </MemberField>
                  <MemberField label={labels.scheduledAt}>
                    <time dateTime={journey.scheduledAt}>
                      {dateTimeFormatter.format(new Date(journey.scheduledAt))}
                    </time>
                  </MemberField>
                  <MemberField label={labels.attemptCount}>
                    {journey.attemptCount}
                  </MemberField>
                  <MemberField label={labels.errorCode}>
                    {valueOrEmpty(journey.errorCode, labels.empty)}
                  </MemberField>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>}

      {(activeHistory === undefined || activeHistory === "whatsapp") && <section
        aria-labelledby="member-whatsapp-heading"
        className="glass-card space-y-4 p-5 sm:p-8"
      >
        <h2
          className="font-serif text-2xl font-semibold"
          id="member-whatsapp-heading"
        >
          {labels.whatsapp}
        </h2>
        {view.whatsapp.length === 0 ? (
          <p className="text-sm text-muted-foreground">{labels.empty}</p>
        ) : (
          <ul className="space-y-4">
            {view.whatsapp.map((message) => (
              <li className="border-t border-border pt-4" key={message.id}>
                <p className="font-medium">{message.template}</p>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <MemberField label={labels.status}>{message.status}</MemberField>
                  <MemberField label={labels.classification}>
                    {message.classification}
                  </MemberField>
                  <MemberField label={labels.attemptCount}>
                    {message.attemptCount}
                  </MemberField>
                  <MemberField label={labels.errorCode}>
                    {valueOrEmpty(message.errorCode, labels.empty)}
                  </MemberField>
                  <MemberField label={labels.createdAt}>
                    <time dateTime={message.createdAt}>
                      {dateTimeFormatter.format(new Date(message.createdAt))}
                    </time>
                  </MemberField>
                  <MemberField label={labels.locale}>
                    {message.locale}
                  </MemberField>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>}

      {(activeHistory === undefined || activeHistory === "suppressions") && <section
        aria-labelledby="member-suppressions-heading"
        className="glass-card space-y-4 p-5 sm:p-8"
      >
        <h2
          className="font-serif text-2xl font-semibold"
          id="member-suppressions-heading"
        >
          {labels.suppressions}
        </h2>
        {view.suppressions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{labels.empty}</p>
        ) : (
          <ul className="space-y-4">
            {view.suppressions.map((suppression) => (
              <li className="border-t border-border pt-4" key={suppression.id}>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <MemberField label={labels.channel}>
                    {suppression.channel}
                  </MemberField>
                  <MemberField label={labels.classification}>
                    {suppression.classification}
                  </MemberField>
                  <MemberField label={labels.reasonCode}>
                    {valueOrEmpty(suppression.reasonCode, labels.empty)}
                  </MemberField>
                  <MemberField label={labels.createdAt}>
                    <time dateTime={suppression.createdAt}>
                      {dateTimeFormatter.format(new Date(suppression.createdAt))}
                    </time>
                  </MemberField>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>}

      {(activeHistory === undefined || activeHistory === "notes") && <section
        aria-labelledby="member-notes-heading"
        className="glass-card space-y-4 p-5 sm:p-8 lg:col-span-2"
      >
        <h2
          className="font-serif text-2xl font-semibold"
          id="member-notes-heading"
        >
          {labels.notes}
        </h2>
        {view.notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{labels.empty}</p>
        ) : (
          <ul className="space-y-4">
            {view.notes.map((note) => (
              <li className="border-t border-border pt-4" key={note.id}>
                <p className="whitespace-pre-wrap">{note.body}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {note.authorProfileId} ·{" "}
                  <time dateTime={note.createdAt}>{dateTimeFormatter.format(new Date(note.createdAt))}</time>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>}
    </div>
  );
}
