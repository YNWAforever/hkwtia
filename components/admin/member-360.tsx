import type {ReactNode} from "react";

import type {AppLocale} from "@/i18n/routing";
import type {Member360} from "@/lib/admin/member-360";

export type Member360Labels = Readonly<{
  profile: string;
  companies: string;
  membership: string;
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
}: Member360ViewProps) {
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
              {view.membership.planCode}
            </MemberField>
            <MemberField label={labels.status}>
              {view.membership.status}
            </MemberField>
            <MemberField label={labels.renewal}>
              {valueOrEmpty(view.membership.renewalAt, labels.empty)}
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
        {view.engagement.events.length === 0 ? (
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
        )}
      </section>

      <section
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
      </section>

      <section
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
      </section>

      <section
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
      </section>

      <section
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
      </section>

      <section
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
      </section>

      <section
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
                  <time dateTime={note.createdAt}>{note.createdAt}</time>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
