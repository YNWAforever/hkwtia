import {PrivateLink as Link} from "@/components/internal-shell/private-link";
import {localizedPath} from "@/lib/urls";
import type {AppLocale} from "@/i18n/routing";
import type {ApplicationQueueItem} from "@/lib/db/repos/admin-members";
export type ApplicationQueueLabels = Readonly<{caption: string; applicant: string; application: string; company: string; plan: string; step: string; membership: string; billing: string; updated: string; none: string; empty: string; states: Readonly<Record<string,string>>; steps: Readonly<Record<string,string>>; plans: Readonly<Record<string,string>>; billingStates: Readonly<Record<string,string>>}>;
export function ApplicationQueueTable({locale, items, labels}: Readonly<{locale: AppLocale; items: readonly ApplicationQueueItem[]; labels: ApplicationQueueLabels}>) {
  const date = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Hong_Kong"});
  return <div className="overflow-x-auto rounded-md border"><table className="min-w-full text-left text-sm">
    <caption className="px-4 py-3 text-left font-medium">{labels.caption}</caption>
    <thead className="bg-muted/40"><tr>{[labels.applicant, labels.application, labels.company, labels.plan, labels.step, labels.membership, labels.billing, labels.updated].map((label) => <th className="px-4 py-3" key={label} scope="col">{label}</th>)}</tr></thead>
    <tbody>{items.map((item) => <tr className="border-t" key={item.applicationId}>
      <th className="px-4 py-3" scope="row"><Link className="text-primary underline" href={localizedPath(locale, `/admin/members/${encodeURIComponent(item.profileId)}`)}>{item.name}</Link><p className="font-normal text-muted-foreground">{item.email ?? labels.none}</p></th>
      <td className="px-4 py-3"><Link className="inline-flex min-h-11 items-center text-primary underline" href={localizedPath(locale, `/admin/members/queue/${item.applicationId}`)}>{labels.states[item.applicationState] ?? item.applicationState}</Link><code className="text-xs">{item.applicationId}</code></td>
      <td className="px-4 py-3">{item.companyName ?? labels.none}</td>
      <td className="px-4 py-3">{labels.plans[item.planCode] ?? item.planCode}</td>
      <td className="px-4 py-3">{labels.steps[item.step] ?? item.step}</td>
      <td className="px-4 py-3"><p>{item.membershipState ? labels.states[item.membershipState] ?? item.membershipState : labels.none}</p>{item.membershipId ? <code className="text-xs">{item.membershipId}</code> : null}</td>
      <td className="px-4 py-3"><p>{item.billingState ? labels.billingStates[item.billingState] ?? item.billingState : labels.none}</p>{item.billingAttemptId ? <code className="text-xs">{item.billingAttemptId}</code> : null}</td>
      <td className="whitespace-nowrap px-4 py-3"><time dateTime={item.updatedAt}>{date.format(new Date(item.updatedAt))}</time></td>
    </tr>)}</tbody>
  </table>{items.length === 0 ? <p className="px-4 py-6 text-muted-foreground">{labels.empty}</p> : null}</div>;
}
