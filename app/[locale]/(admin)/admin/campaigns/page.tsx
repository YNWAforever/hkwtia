import {randomUUID} from "node:crypto";

import Link from "next/link";
import {redirect} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {
  CampaignWizard,
  type CampaignEligibilityRow,
  type CampaignWizardOption,
} from "@/components/admin/campaign-wizard";
import type {AppLocale} from "@/i18n/routing";
import {ELIGIBILITY_CATEGORIES} from "@/lib/admin/campaign-eligibility";
import {createCampaignDraftAction} from "@/lib/admin/campaign-review-actions";
import {
  EMAIL_SOURCE_TEMPLATES,
  VARIABLE_TOKEN_HINT,
  parseCampaignWizardQuery,
  previewCampaignAudience,
  templateVariablesFor,
  visibleWizardSteps,
  wizardBlockingStep,
} from "@/lib/admin/campaign-wizard";
import {campaignDraftHref, listCampaigns, resolveCampaignDraft} from "@/lib/admin/campaigns";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {segmentsRepository} from "@/lib/db/repos/segments";
import {whatsappTemplatesRepository} from "@/lib/db/repos/whatsapp-templates";
import {localizedPath} from "@/lib/urls";

type Query = Record<string, string | string[] | undefined>;
type Props = Readonly<{params: Promise<{locale: string}>; searchParams: Promise<Query>}>;

/** `missing_variable` is not an `EligibilityCategory` — it is a template fact, not a consent one — but the preview has to show it beside them. */
const PREVIEW_REASONS = [...ELIGIBILITY_CATEGORIES, "missing_variable"] as const;

export default async function AdminCampaignsPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const rawSearchParams = await searchParams;
  // The draft id IS the idempotency key, minted once per wizard run and carried
  // in the URL from the first step — the pattern `/admin/segments` already uses,
  // and what makes a double-submitted final step recover the draft that exists
  // instead of writing a second one.
  const draft = resolveCampaignDraft(rawSearchParams.campaignDraft, randomUUID);
  if (draft.created) {
    redirect(campaignDraftHref(localizedPath(locale, "/admin/campaigns"), rawSearchParams, draft.draftId));
  }
  const state = parseCampaignWizardQuery(rawSearchParams, draft.draftId);

  const [templates, segments, campaigns] = await Promise.all([
    // A staff read must not pretend the registry is empty when the database is
    // unreachable: "nothing approved" and "we could not ask" lead to opposite
    // actions, and only one of them means a blast would send nothing.
    whatsappTemplatesRepository.list(actor).catch(() => null),
    segmentsRepository.list(actor).catch(() => null),
    listCampaigns(actor).catch(() => null),
  ]);
  const t = await getTranslations({locale, namespace: "Admin.campaigns"});
  // The two email source templates are labelled once, by /admin/segments, whose
  // Queue button still offers them (S-17). Re-spelling them here would let the
  // two screens drift over what "member-update" sends.
  const tSegments = await getTranslations({locale, namespace: "Admin.segments"});

  const header = (
    <header className="space-y-3">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p>
      <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{t("title")}</h1>
      <p className="text-lg text-muted-foreground">{t("description")}</p>
    </header>
  );

  if (templates === null || segments === null || campaigns === null) {
    return <div className="space-y-8">{header}<p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-4 text-destructive" role="alert">{t("error")}</p></div>;
  }

  // S-14 at the one place a human chooses. `approvedTemplateKeys` returns the
  // whole config set in mock mode, so a wizard built on it would offer, in CI
  // and in preview, keys production will silently skip.
  const approved = templates.filter((template) => template.status === "approved");
  const templateOptions: readonly CampaignWizardOption[] = state.channel === "whatsapp"
    ? approved.map((template) => ({value: template.key, label: `${template.elementName} (${template.languageCode})`}))
    : EMAIL_SOURCE_TEMPLATES.map((template) => ({
      value: template,
      label: template === "renewal-reminder" ? tSegments("templateRenewal") : tSegments("templateUpdate"),
    }));
  // The creator's own segments (`segmentsRepository.list` is owner-scoped) and
  // deliberately so: segment ownership names member emails, and S-7 keeps the
  // reviewer reading the snapshot on `campaign_recipients` instead.
  const segmentOptions: readonly CampaignWizardOption[] = segments.map((segment) => ({
    value: segment.id,
    label: locale === "zh-HK" ? segment.nameZh ?? segment.nameEn : segment.nameEn,
  }));

  const templateVariables = templateVariablesFor(state, approved);
  // The state, not just the variables it resolved to: on the template step the
  // key is still unchosen, and deriving the step set from the empty array alone
  // is what made the Next button skip the variables step for every
  // parameterised WhatsApp template.
  const steps = visibleWizardSteps(state, templateVariables);
  const blocking = wizardBlockingStep(state, templateVariables);
  // Named by step. "Every field must be filled in" is true of the variables
  // step and of nothing else, and reading it on an unsaved segment sends the
  // admin to fix a screen that was already right.
  const blockedNotice = blocking === null
    ? null
    : blocking === "variables" ? t("variables.missing") : t("blocked", {step: t(`steps.${blocking}`)});
  const summary = state.step === "preview" && blocking === null && state.segmentId !== null
    ? await previewCampaignAudience(actor, {
      segmentId: state.segmentId,
      channel: state.channel,
      templateVariables,
      variablesTemplate: state.variables,
    }).catch(() => null)
    : null;
  const eligibility: readonly CampaignEligibilityRow[] | null = summary === null ? null : PREVIEW_REASONS.map((reason) => ({
    reason,
    label: t(`eligibility.${reason}`),
    count: reason === "eligible" ? summary.eligible : summary.byReason[reason] ?? 0,
  }));

  const browserPath = localizedPath(locale, "/admin/campaigns");
  // The INTERNAL app-router path: `revalidatePath` does not go through
  // `localizedPath`, and `/zh-HK/…` is the correct spelling there.
  const path = `/${locale}/admin/campaigns`;

  return (
    <div className="space-y-8">
      {header}
      <section className="glass-card space-y-4 p-6">
        <CampaignWizard
          blockedNotice={blockedNotice}
          blocking={blocking}
          createAction={createCampaignDraftAction.bind(null, path, browserPath)}
          eligibility={eligibility}
          formPath={browserPath}
          labels={{
            steps: {
              name: t("steps.name"),
              channel: t("steps.channel"),
              template: t("steps.template"),
              variables: t("steps.variables"),
              segment: t("steps.segment"),
              preview: t("steps.preview"),
            },
            channel: {email: t("channel.email"), whatsapp: t("channel.whatsapp")},
            fields: {name: t("fields.name"), template: t("fields.template"), segment: t("fields.segment")},
            variables: {
              legend: t("variables.legend"),
              hint: t("variables.hint", {tokens: VARIABLE_TOKEN_HINT}),
            },
            actions: {
              createDraft: t("actions.createDraft"),
              next: t("actions.next"),
              back: t("actions.back"),
              goToStep: t("actions.goToStep"),
            },
            templateUnapproved: t("templateUnapproved"),
            noSegments: t("noSegments"),
            recipients: t("report.total"),
          }}
          segmentOptions={segmentOptions}
          state={state}
          steps={steps}
          summary={summary}
          templateOptions={templateOptions}
          templateVariables={templateVariables}
        />
      </section>
      <section className="glass-card space-y-4 p-6">
        {campaigns.length === 0 ? <p className="text-muted-foreground">{t("empty")}</p> : (
          <ul className="divide-y divide-border">
            {campaigns.map((campaign) => (
              <li className="flex flex-wrap items-baseline justify-between gap-4 py-3" key={campaign.id}>
                <Link className="font-medium underline-offset-4 hover:underline" href={`${browserPath}/${campaign.id}`}>
                  {campaign.name ?? campaign.id}
                </Link>
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
                    <dt className="sr-only">{t("columns.created")}</dt>
                    {/* ISO rather than a locale format: this list is read
                        against `audit_events` and a provider console, both of
                        which record UTC dates. */}
                    <dd className="font-mono text-xs">{campaign.createdAt.toISOString().slice(0, 10)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
