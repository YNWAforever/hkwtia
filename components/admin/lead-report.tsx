import {CONTACT_SOURCES, CONTACT_STAGES, type ContactSource, type ContactStage} from "@/lib/db/repos/contacts";
import type {LeadReport as LeadReportData} from "@/lib/db/repos/lead-report";
import type {PlanCode} from "@/lib/membership/catalog";

/**
 * Phase E, Task 10. Display-only: every figure arrives already aggregated, and
 * every string arrives from the page's translator (CLAUDE.md rule 6). Nothing
 * here fetches, so a failed read is the page's "unavailable" alert and this
 * component is never rendered with placeholder zeros.
 */
export type LeadReportLabels = Readonly<{
  funnelHeading: string;
  funnelCaption: string;
  sourceColumn: string;
  totalColumn: string;
  memberRate: string;
  emptyFunnel: string;
  stage: Readonly<Record<ContactStage, string>>;
  source: Readonly<Record<ContactSource, string>>;
  ownersHeading: string;
  ownersCaption: string;
  ownerColumn: string;
  unassigned: string;
  invitesSentColumn: string;
  invitesOpenedColumn: string;
  applicationsColumn: string;
  membersColumn: string;
  emptyOwners: string;
  invitesHeading: string;
  sent: string;
  opened: string;
  applied: string;
  paid: string;
  joinedFree: string;
  ofSent: (percent: string) => string;
  median: string;
  medianValue: (hours: string) => string;
  noMedian: string;
  invitedVsJoinedHeading: string;
  invitedColumn: string;
  joinedColumn: string;
  countColumn: string;
  emptyPlans: string;
  plan: Readonly<Record<PlanCode, string>>;
  estimateHeading: string;
  estimateLabel: string;
  estimateNote: string;
}>;

type Props = Readonly<{report: LeadReportData; labels: LeadReportLabels; locale: string}>;

const cell = "px-3 py-2 text-right tabular-nums";
const head = "px-3 py-2 text-right font-medium";

export function LeadReport({report, labels, locale}: Props) {
  const number = new Intl.NumberFormat(locale, {maximumFractionDigits: 1});
  const percent = new Intl.NumberFormat(locale, {style: "percent", maximumFractionDigits: 0});
  const fees = new Intl.NumberFormat(locale, {style: "currency", currency: "HKD", maximumFractionDigits: 0});
  const share = (part: number, whole: number) => whole > 0 ? percent.format(part / whole) : "–";

  const sourceTotals = CONTACT_SOURCES.map((source) => ({
    source,
    total: CONTACT_STAGES.reduce((sum, stage) => sum + report.bySource[source][stage], 0),
  }));
  const anyLeads = sourceTotals.some((row) => row.total > 0);
  const { invites } = report;

  return (
    <div className="space-y-8">
      <section aria-labelledby="lead-report-funnel" className="glass-card space-y-3 p-6">
        <h2 className="font-serif text-2xl font-semibold" id="lead-report-funnel">{labels.funnelHeading}</h2>
        {anyLeads ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <caption className="pb-2 text-left text-muted-foreground">{labels.funnelCaption}</caption>
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-medium" scope="col">{labels.sourceColumn}</th>
                  {CONTACT_STAGES.map((stage) => <th className={head} key={stage} scope="col">{labels.stage[stage]}</th>)}
                  <th className={head} scope="col">{labels.totalColumn}</th>
                  <th className={head} scope="col">{labels.memberRate}</th>
                </tr>
              </thead>
              <tbody>
                {sourceTotals.map(({source, total}) => (
                  <tr className="border-b border-border/60" key={source}>
                    <th className="px-3 py-2 text-left font-medium" scope="row">{labels.source[source]}</th>
                    {CONTACT_STAGES.map((stage) => <td className={cell} key={stage}>{number.format(report.bySource[source][stage])}</td>)}
                    <td className={cell}>{number.format(total)}</td>
                    <td className={cell}>{share(report.bySource[source].member, total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-muted-foreground">{labels.emptyFunnel}</p>}
      </section>

      <section aria-labelledby="lead-report-owners" className="glass-card space-y-3 p-6">
        <h2 className="font-serif text-2xl font-semibold" id="lead-report-owners">{labels.ownersHeading}</h2>
        {report.byOwner.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <caption className="pb-2 text-left text-muted-foreground">{labels.ownersCaption}</caption>
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-medium" scope="col">{labels.ownerColumn}</th>
                  <th className={head} scope="col">{labels.totalColumn}</th>
                  <th className={head} scope="col">{labels.invitesSentColumn}</th>
                  <th className={head} scope="col">{labels.invitesOpenedColumn}</th>
                  <th className={head} scope="col">{labels.applicationsColumn}</th>
                  <th className={head} scope="col">{labels.membersColumn}</th>
                </tr>
              </thead>
              <tbody>
                {report.byOwner.map((owner) => (
                  <tr className="border-b border-border/60" key={owner.ownerProfileId ?? "unassigned"}>
                    <th className="px-3 py-2 text-left font-medium" scope="row">{owner.ownerProfileId === null ? labels.unassigned : (owner.ownerName ?? owner.ownerProfileId)}</th>
                    <td className={cell}>{number.format(owner.leads)}</td>
                    <td className={cell}>{number.format(owner.invitesSent)}</td>
                    <td className={cell}>{number.format(owner.invitesOpened)}</td>
                    <td className={cell}>{number.format(owner.applications)}</td>
                    <td className={cell}>{number.format(owner.members)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-muted-foreground">{labels.emptyOwners}</p>}
      </section>

      <section aria-labelledby="lead-report-invites" className="glass-card space-y-4 p-6">
        <h2 className="font-serif text-2xl font-semibold" id="lead-report-invites">{labels.invitesHeading}</h2>
        <dl className="grid gap-4 sm:grid-cols-4">
          <div><dt className="text-sm text-muted-foreground">{labels.sent}</dt><dd className="text-2xl font-semibold tabular-nums">{number.format(invites.sent)}</dd></div>
          <div><dt className="text-sm text-muted-foreground">{labels.opened}</dt><dd className="text-2xl font-semibold tabular-nums">{number.format(invites.opened)}</dd><dd className="text-sm text-muted-foreground">{labels.ofSent(share(invites.opened, invites.sent))}</dd></div>
          <div><dt className="text-sm text-muted-foreground">{labels.applied}</dt><dd className="text-2xl font-semibold tabular-nums">{number.format(invites.applied)}</dd><dd className="text-sm text-muted-foreground">{labels.ofSent(share(invites.applied, invites.sent))}</dd></div>
          <div><dt className="text-sm text-muted-foreground">{labels.paid}</dt><dd className="text-2xl font-semibold tabular-nums">{number.format(invites.paid)}</dd><dd className="text-sm text-muted-foreground">{labels.ofSent(share(invites.paid, invites.sent))}</dd></div>
        </dl>
        <p data-testid="joined-free">
          <span className="text-sm text-muted-foreground">{labels.joinedFree}: </span>
          <span className="font-semibold tabular-nums">{number.format(invites.joinedFree)}</span>
        </p>
        <p data-testid="median-hours">
          <span className="text-sm text-muted-foreground">{labels.median}: </span>
          <span className="font-semibold tabular-nums">
            {invites.medianInviteToPaidHours === null ? labels.noMedian : labels.medianValue(number.format(invites.medianInviteToPaidHours))}
          </span>
        </p>

        <h3 className="pt-2 font-serif text-xl font-semibold">{labels.invitedVsJoinedHeading}</h3>
        {invites.invitedVsJoined.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left font-medium" scope="col">{labels.invitedColumn}</th>
                <th className="px-3 py-2 text-left font-medium" scope="col">{labels.joinedColumn}</th>
                <th className={head} scope="col">{labels.countColumn}</th>
              </tr>
            </thead>
            <tbody>
              {invites.invitedVsJoined.map((row) => (
                <tr className="border-b border-border/60" key={`${row.invited}:${row.joined}`}>
                  <td className="px-3 py-2">{labels.plan[row.invited]}</td>
                  <td className="px-3 py-2">{labels.plan[row.joined]}</td>
                  <td className={cell}>{number.format(row.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-muted-foreground">{labels.emptyPlans}</p>}
      </section>

      <section aria-labelledby="lead-report-estimate" className="glass-card space-y-2 p-6">
        <h2 className="font-serif text-2xl font-semibold" id="lead-report-estimate">{labels.estimateHeading}</h2>
        <p className="flex flex-wrap items-baseline gap-3" data-testid="estimated-fees">
          <span className="text-3xl font-semibold tabular-nums">{fees.format(report.estimatedFirstYearHkd)}</span>
          <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium uppercase tracking-wide">{labels.estimateLabel}</span>
        </p>
        <p className="text-sm text-muted-foreground">{labels.estimateNote}</p>
      </section>
    </div>
  );
}
