import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {CampaignReport} from "@/components/admin/campaign-report";
import type {AppLocale} from "@/i18n/routing";
import {ELIGIBILITY_CATEGORIES} from "@/lib/admin/campaign-eligibility";
import {
  approveCampaignAction,
  rejectCampaignAction,
  submitCampaignForReviewAction,
} from "@/lib/admin/campaign-review-actions";
import {isCampaignId} from "@/lib/admin/campaign-wizard";
import {readCampaign} from "@/lib/admin/campaigns";
import {formatHongKongDateTimeLocal} from "@/lib/admin/event-form-input";
import {requireAdminPageActor} from "@/lib/admin/page-auth";

type Props = Readonly<{params: Promise<{locale: string; id: string}>}>;

const fieldClass = "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2";

export default async function AdminCampaignDetailPage({params}: Props) {
  const {locale: localeValue, id} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  // Asked before the read, so a mistyped URL is the 404 every other admin route
  // gives an id that names nothing, rather than a ZodError the page would have
  // to render as "we could not load campaigns".
  if (!isCampaignId(id)) notFound();
  // `null` is "no such campaign" and `undefined` is "we could not ask". They
  // lead to opposite conclusions — one is a bad link, the other is an outage —
  // so the page must not collapse them into one empty report.
  const result = await readCampaign(actor, id).catch(() => undefined);
  if (result === null) notFound();
  const t = await getTranslations({locale, namespace: "Admin.campaigns"});

  if (result === undefined) {
    return (
      <div className="space-y-8">
        <h1 className="font-serif text-4xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-4 text-destructive" role="alert">{t("error")}</p>
      </div>
    );
  }

  const {campaign, report} = result;
  // S-7 as the screen states it. The authorization itself is `reviewableCampaign`
  // in the repository — this is only what stops the creator being offered a
  // control that would refuse them.
  const isCreator = campaign.createdByProfileId === actor.profileId;
  const path = `/${locale}/admin/campaigns/${campaign.id}`;
  // Every reason key anything in the tree writes, not only the snapshot-time
  // ones. `campaign-report.tsx` falls back to the raw key for a code it has
  // never seen, and `marketing_suppressed` — which `campaign-runner.ts` writes
  // for any member who withdraws between draft and send — is the one code the
  // runner actually produces, so without it a zh-HK admin routinely read an
  // English snake_case token on the most sensitive row of the report.
  const reasonLabels = Object.fromEntries(
    [...ELIGIBILITY_CATEGORIES, "missing_variable", "marketing_suppressed"].map((reason) => [reason, t(`eligibility.${reason}`)]),
  );

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{campaign.name ?? t("title")}</h1>
        <dl className="flex flex-wrap gap-6 text-sm text-muted-foreground">
          <div>
            <dt className="sr-only">{t("steps.channel")}</dt>
            <dd>{t(`channel.${campaign.channel}`)}</dd>
          </div>
          <div>
            <dt className="sr-only">{t("columns.status")}</dt>
            <dd>{t(`status.${campaign.status}`)}</dd>
          </div>
          <div>
            <dt className="sr-only">{t("fields.template")}</dt>
            <dd className="font-mono text-xs">{campaign.templateKey ?? campaign.template}</dd>
          </div>
          {campaign.scheduledAt === null ? null : (
            <div>
              <dt className="sr-only">{t("fields.scheduledAt")}</dt>
              <dd className="font-mono text-xs">{campaign.scheduledAt.toISOString()}</dd>
            </div>
          )}
        </dl>
        {campaign.rejectionReason === null ? null : (
          <p className="rounded-md border border-border/70 bg-muted/40 px-4 py-3 text-sm">
            {t("rejectionReason")}: {campaign.rejectionReason}
          </p>
        )}
      </header>

      <section className="glass-card space-y-4 p-6">
        {campaign.status === "draft" && isCreator ? (
          <form action={submitCampaignForReviewAction.bind(null, path)}>
            <input name="campaignId" type="hidden" value={campaign.id} />
            <button className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" type="submit">
              {t("actions.submitForReview")}
            </button>
          </form>
        ) : null}

        {campaign.status === "review" && isCreator ? <p className="text-sm text-muted-foreground">{t("ownDraft")}</p> : null}

        {campaign.status === "review" && !isCreator ? (
          <div className="space-y-6">
            <form action={approveCampaignAction.bind(null, path)} className="space-y-3">
              <input name="campaignId" type="hidden" value={campaign.id} />
              {campaign.channel === "whatsapp" ? (
                <label className="grid max-w-sm gap-1 text-sm">
                  <span>{t("fields.scheduledAt")}</span>
                  {/* Hong Kong wall-clock, the convention every other admin
                      datetime input uses; `parseScheduledAt` reads it back the
                      same way, because a value with no zone read as UTC would
                      send a blast eight hours early. */}
                  <input className={fieldClass} min={formatHongKongDateTimeLocal(new Date())} name="scheduledAt" required type="datetime-local" />
                </label>
              ) : (
                // Task 10 Step 4c wires `promoteScheduledCampaigns` for both
                // channels; until it lands nothing promotes `scheduled →
                // queued`, so approving an email campaign queues it for the next
                // hourly run instead of offering a send time that would never
                // fire. An email campaign stuck in `scheduled` produces no error
                // anywhere — the list just reads "Scheduled" forever, which is
                // silent, permanent, and indistinguishable from waiting.
                <p className="text-sm text-muted-foreground">{t("scheduleUnavailable")}</p>
              )}
              {/* The email arm says "queue", because the sentence directly above
                  it says this campaign cannot be scheduled. One button reading
                  "Approve and schedule" beside "cannot be scheduled for a later
                  time" is a contradiction on the one screen whose whole purpose
                  is a second admin reading carefully before a blast. */}
              <button className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" type="submit">
                {campaign.channel === "whatsapp" ? t("actions.approve") : t("actions.approveEmail")}
              </button>
            </form>
            <form action={rejectCampaignAction.bind(null, path)} className="space-y-3">
              <input name="campaignId" type="hidden" value={campaign.id} />
              <label className="grid max-w-sm gap-1 text-sm">
                <span>{t("rejectionReason")}</span>
                <textarea className="min-h-16 w-full rounded-md border border-input bg-background p-2" maxLength={500} name="rejectionReason" required />
              </label>
              <button className="min-h-11 rounded-md border border-input px-4 py-2 text-sm" type="submit">
                {t("actions.reject")}
              </button>
            </form>
          </div>
        ) : null}
      </section>

      <section className="glass-card p-6">
        <CampaignReport
          channel={campaign.channel}
          labels={{
            title: t("report.title"),
            total: t("report.total"),
            queued: t("report.queued"),
            sent: t("report.sent"),
            delivered: t("report.delivered"),
            read: t("report.read"),
            failed: t("report.failed"),
            blocked: t("report.blocked"),
            reason: reasonLabels,
          }}
          report={report}
        />
      </section>
    </div>
  );
}
