import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import type {AtRiskMember} from "@/lib/admin/at-risk";
import {localizedPath} from "@/lib/urls";

type PlanCode = "community" | "startup" | "corporate" | "patron";
export type AtRiskTableLabels = Readonly<{
  caption: string; empty: string; name: string; company: string; tier: string; status: string;
  score: string; trend: string; renewal: string; evidence: string; actions: string; unavailable: string;
  scoreEvidence: string; renewalEvidence: string; member360: string; addNote: string; campaign: string;
  plans: Readonly<Record<PlanCode, string>>;
  statuses: Readonly<Record<"active" | "past_due", string>>;
}>;

type Props = Readonly<{locale: AppLocale; labels: AtRiskTableLabels; members: readonly AtRiskMember[]}>;

function interpolate(template: string, key: string, value: number): string {
  return template.replace(`{${key}}`, String(value));
}

function planLabel(labels: AtRiskTableLabels, planCode: string): string {
  return Object.hasOwn(labels.plans, planCode) ? labels.plans[planCode as PlanCode] : labels.unavailable;
}

export function AtRiskTable({locale, labels, members}: Props) {
  const columns = [labels.name, labels.company, labels.tier, labels.status, labels.score, labels.trend, labels.renewal, labels.evidence, labels.actions];
  const dateFormatter = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeZone: "Asia/Hong_Kong"});
  return <div className="overflow-x-auto rounded-md border border-border">
    <table className="min-w-full text-left text-sm">
      <caption className="caption-top px-4 py-3 text-left font-medium text-foreground">{labels.caption}</caption>
      <thead className="border-y border-border bg-muted/40 text-muted-foreground"><tr>{columns.map((label) => <th className="px-4 py-3 font-medium" key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{members.map((member) => {
        const memberHref = localizedPath(locale, `/admin/members/${encodeURIComponent(member.profileId)}`);
        const campaignQuery = new URLSearchParams({
          profileId: member.profileId,
          status: member.status,
          scoreMax: String(member.score),
          renewalWithinDays: String(member.evidence.renewalWithinDays),
        });
        const campaignHref = `${localizedPath(locale, "/admin/segments")}?${campaignQuery.toString()}`;
        return <tr className="border-b border-border align-top last:border-0" key={member.profileId}>
          <th className="px-4 py-3 font-medium text-foreground" scope="row">{member.displayName}</th>
          <td className="px-4 py-3">{member.companyName ?? labels.unavailable}</td><td className="px-4 py-3">{planLabel(labels, member.planCode)}</td><td className="px-4 py-3">{labels.statuses[member.status]}</td>
          <td className="px-4 py-3">{member.score}</td><td className="px-4 py-3">{member.trend ?? labels.unavailable}</td><td className="px-4 py-3">{member.renewalAt ? dateFormatter.format(member.renewalAt) : labels.unavailable}</td>
          <td className="px-4 py-3"><ul><li>{interpolate(labels.scoreEvidence, "score", member.evidence.scoreBelow)}</li><li>{interpolate(labels.renewalEvidence, "days", member.evidence.renewalWithinDays)}</li></ul></td>
          <td className="px-4 py-3"><div className="flex min-w-32 flex-col items-start gap-2"><Link className="text-primary hover:underline" href={memberHref}>{labels.member360}</Link><Link className="text-primary hover:underline" href={`${memberHref}#member-note-body`}>{labels.addNote}</Link><Link className="text-primary hover:underline" href={campaignHref}>{labels.campaign}</Link></div></td>
        </tr>;
      })}</tbody>
    </table>
    {members.length === 0 ? <p className="px-4 py-6 text-muted-foreground">{labels.empty}</p> : null}
  </div>;
}
