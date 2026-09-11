import type {CampaignReport as CampaignReportRecord} from "@/lib/admin/campaigns";

/**
 * Programme C-5. What a campaign did, grouped the way `campaignReportFor`
 * groups it: the send states, then everyone the campaign did not reach and why.
 *
 * `delivered` and `read` are real rows rather than decoration ONLY because Task
 * 10 Step 4b teaches `recordDeliveryStatus` to fall through to
 * `campaign_recipients` when its `messages` UPDATE matches nothing. A campaign
 * send writes its provider id to `campaign_recipients.provider_message_id` and
 * creates no `messages` row at all, so without that fall-through no
 * delivery-status webhook can match a campaign recipient and these two counters
 * read permanently zero after a blast that in fact delivered — which staff
 * would reasonably read as "nothing arrived". If that step is ever cut, cut
 * these two rows and their bundle strings with it: a zero that means "not
 * implemented" is worse than an absent column.
 *
 * The blocked breakdown carries a label per reason and falls back to the reason
 * key itself. That fallback is deliberate: `blocked_reason` names an
 * eligibility category the preview was written in, but a recipient refused at
 * SEND time carries only an `error_code`, and inventing a friendly word for a
 * code this screen has never seen would mislabel it.
 */
export type CampaignReportLabels = Readonly<{
  title: string;
  total: string;
  sent: string;
  delivered: string;
  read: string;
  failed: string;
  blocked: string;
  reason: Readonly<Record<string, string>>;
}>;

type Props = Readonly<{report: CampaignReportRecord; labels: CampaignReportLabels}>;

export function CampaignReport({report, labels}: Props) {
  const counters: readonly (readonly [string, number])[] = [
    [labels.total, report.total],
    [labels.sent, report.sent],
    [labels.delivered, report.delivered],
    [labels.read, report.read],
    [labels.failed, report.failed],
    [labels.blocked, report.blocked],
  ];
  const reasons = Object.entries(report.byReason).sort(([left], [right]) => left.localeCompare(right));
  return (
    <section className="space-y-4">
      <h2 className="font-serif text-2xl font-semibold">{labels.title}</h2>
      <dl className="grid gap-2 sm:grid-cols-3">
        {counters.map(([label, count]) => (
          <div className="rounded-md border border-border px-4 py-3" key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="font-mono text-2xl">{count}</dd>
          </div>
        ))}
      </dl>
      {reasons.length === 0 ? null : (
        <dl className="max-w-md divide-y divide-border rounded-md border border-border">
          {reasons.map(([reason, count]) => (
            <div className="flex items-center justify-between gap-4 px-4 py-2 text-sm" key={reason}>
              <dt>{labels.reason[reason] ?? reason}</dt>
              <dd className="font-mono">{count}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
