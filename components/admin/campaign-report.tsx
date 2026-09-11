import type {CampaignChannel} from "@/lib/admin/campaign-eligibility";
import type {CampaignReport as CampaignReportRecord} from "@/lib/admin/campaigns";

/**
 * Programme C-5. What a campaign did, grouped the way `campaignReportFor`
 * groups it: the send states, then everyone the campaign did not reach and why.
 *
 * `delivered` and `read` are rendered for the WhatsApp lane ONLY, because that
 * is the only lane anything will ever write them in. Task 10 Step 4b teaches
 * `recordDeliveryStatus` to fall through to `campaign_recipients` when its
 * `messages` UPDATE matches nothing — a campaign send writes its provider id to
 * `campaign_recipients.provider_message_id` and creates no `messages` row at
 * all — and that method is the Woztell delivery-status webhook's. Email has no
 * delivery webhook at all (this tree carries two handlers, Woztell and Stripe,
 * and nothing plans a third), so on an email campaign both columns stay NULL
 * forever and both counters would sit at zero underneath a "Sent 18" that in
 * fact went out. Staff read "Delivered 0" after "Sent 18" as "the blast did not
 * arrive" and escalate a working send, so the email report shows six honest
 * numbers rather than eight with two dead ones: a zero that means "not
 * implemented" is worse than an absent column. If Task 10 Step 4b is ever cut,
 * cut these two rows for WhatsApp as well and record why.
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

type Props = Readonly<{report: CampaignReportRecord; labels: CampaignReportLabels; channel: CampaignChannel}>;

export function CampaignReport({report, labels, channel}: Props) {
  // The channel gate the docblock above explains. Kept here rather than at the
  // caller so the rule and the reason it exists stay in one place.
  const deliveryCounters: readonly (readonly [string, number])[] =
    channel === "whatsapp" ? [[labels.delivered, report.delivered], [labels.read, report.read]] : [];
  const counters: readonly (readonly [string, number])[] = [
    [labels.total, report.total],
    [labels.sent, report.sent],
    ...deliveryCounters,
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
