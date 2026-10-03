import Link from "next/link";
import type { AppLocale } from "@/i18n/routing";
import type { Member360 } from "@/lib/admin/member-360";
import type { MemberMaintenance } from "@/lib/admin/work-queue";
import { localizedPath } from "@/lib/urls";
export function MemberMaintenanceSummary({
  locale,
  view,
  maintenance,
  labels,
}: {
  locale: AppLocale;
  view: Member360;
  maintenance: MemberMaintenance | null;
  labels: {
    title: string;
    identity: string;
    linked: string;
    unknown: string;
    membership: string;
    renewal: string;
    payment: string;
    owner: string;
    next: string;
    none: string;
    unassigned: string;
    unavailable: string;
    paymentStates: Readonly<Record<string, string>>;
    membershipStates: Readonly<Record<string, string>>;
    actions: Readonly<Record<string, string>>;
  };
}) {
  const format = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  });
  const membership = view.membership;
  return (
    <section
      aria-labelledby="member-maintenance-heading"
      className="space-y-4 rounded-md border bg-card p-4 sm:p-6"
    >
      <h2 id="member-maintenance-heading" className="text-xl font-semibold">
        {labels.title}
      </h2>
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div>
          <dt className="text-sm text-muted-foreground">{labels.identity}</dt>
          <dd className="mt-1 font-medium">
            {maintenance
              ? maintenance.hasLinkedSubject
                ? labels.linked
                : labels.unknown
              : labels.unavailable}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{labels.membership}</dt>
          <dd className="mt-1 font-medium">
            {membership
              ? (labels.membershipStates[membership.status] ??
                membership.status)
              : labels.none}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{labels.renewal}</dt>
          <dd className="mt-1 font-medium">
            {membership?.renewalAt ? (
              <time dateTime={membership.renewalAt}>
                {format.format(new Date(membership.renewalAt))}
              </time>
            ) : (
              labels.none
            )}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{labels.payment}</dt>
          <dd className="mt-1 font-medium">
            {maintenance
              ? maintenance.paymentAttemptState
                ? (labels.paymentStates[maintenance.paymentAttemptState] ??
                  labels.unknown)
                : labels.none
              : labels.unavailable}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{labels.owner}</dt>
          <dd className="mt-1 font-medium">
            {maintenance
              ? (maintenance.ownerName ?? labels.unassigned)
              : labels.unavailable}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{labels.next}</dt>
          <dd className="mt-1 font-medium">
            {maintenance ? (
              maintenance.applicationId &&
              !["none", "follow_up_complete"].includes(
                maintenance.nextActionCode,
              ) ? (
                <Link
                  className="inline-flex min-h-11 items-center text-primary underline"
                  href={localizedPath(
                    locale,
                    `/admin/members/queue/${maintenance.applicationId}`,
                  )}
                >
                  {labels.actions[maintenance.nextActionCode] ?? labels.next}
                </Link>
              ) : (
                labels.none
              )
            ) : (
              labels.unavailable
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
