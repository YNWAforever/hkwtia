import { PrivateLink as Link } from "@/components/internal-shell/private-link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { localizedPath } from "@/lib/urls";
import { requireAdminPageActor } from "@/lib/admin/page-auth";
import { applicationsRepository } from "@/lib/db/repos/applications";
import { adminMembersRepository } from "@/lib/db/repos/admin-members";
import {
  APPLICATION_MISSING_FIELDS,
  APPLICATION_NEXT_ACTIONS,
} from "@/lib/admin/application-case-types";
import { applicationQueueReturnHref } from "@/lib/admin/application-return";
import {
  AiReviewPanel,
  type AiDraftReviewLabels,
} from "@/components/admin/ai-review-panel";
import { ApplicationDraftAdopt } from "@/components/admin/application-draft-adopt";
import { aiDraftsRepository } from "@/lib/db/repos/ai-drafts";
import { z } from "zod";
import type en from "@/messages/en.json";
import {
  prepareApplicationDraftAction,
  adoptApplicationDraftAction,
} from "@/lib/admin/application-draft-actions";
import { getApplicationTriage } from "@/lib/admin/application-case-service";
import { updateApplicationCaseAction } from "@/lib/admin/application-case-actions";
import {
  ApplicationCaseForm,
  type ApplicationCaseLabels,
  type ApplicationTriageProposal,
} from "@/components/admin/application-case-form";
export default async function ApplicationCasePage({
  params,
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  params: Promise<{
    locale: string;
    id: string;
  }>;
}>) {
  const { locale: rawLocale, id } = await params;
  const locale = rawLocale as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor(`/admin/members/queue/${id}`);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    notFound();
  const record = await applicationsRepository.getApplicationCase(actor, id);
  if (!record) notFound();
  const owners = await adminMembersRepository.listOperationOwners(actor);
  const t = await getTranslations({ locale, namespace: "Admin" });
  const labels: ApplicationCaseLabels = {
    title: t("applicationCase.followUp"),
    description: t("applicationCase.description"),
    owner: t("applicationCase.owner"),
    unassigned: t("applicationCase.unassigned"),
    due: t("applicationCase.due"),
    missing: t("applicationCase.missing"),
    nextAction: t("applicationCase.nextAction"),
    note: t("applicationCase.note"),
    save: t("applicationCase.save"),
    saving: t("applicationCase.saving"),
    saved: t("applicationCase.saved"),
    conflict: t("applicationCase.conflict"),
    error: t("applicationCase.error"),
    refresh: t("applicationCase.refresh"),
    missingFields: Object.fromEntries(
      APPLICATION_MISSING_FIELDS.map((key) => [
        key,
        t(`applicationCase.missingFields.${key}`),
      ]),
    ),
    nextActions: Object.fromEntries(
      APPLICATION_NEXT_ACTIONS.map((key) => [
        key,
        t(`applicationCase.nextActions.${key}`),
      ]),
    ),
  };
  const tt = await getTranslations({ locale, namespace: "ApplicationTriage" });
  let triageProposal: ApplicationTriageProposal | null = null,
    triageUnavailable = false;
  try {
    const snapshot = await getApplicationTriage(actor, id);
    if (!snapshot) triageUnavailable = true;
    else {
      const rule = snapshot.triage,
        missing = rule.missingFields.length
          ? rule.missingFields
              .map((field) => labels.missingFields[field])
              .join("、")
          : tt("noneMissing");
      const payment = tt(
        rule.paymentDisposition === "reconciliation_required"
          ? "paymentReconcile"
          : rule.paymentDisposition === "processing_or_unconfirmed"
            ? "paymentProcessing"
            : "paymentNone",
      );
      const validationMessages = rule.validationIssues.map((field) =>
        tt.has("fields." + field) ? tt("fields." + field) : tt("fields.other"),
      );
      triageProposal = {
        factsHash: snapshot.factsHash,
        caseVersion: snapshot.caseVersion,
        triage: rule,
        validationMessages,
        note: [
          tt("ruleOnly"),
          tt("missingLabel") + ": " + missing,
          tt("nextLabel") + ": " + labels.nextActions[rule.nextActionCode],
          payment,
          rule.validationIssues.length
            ? tt("validation") + " " + validationMessages.join("、")
            : tt("validationNone"),
        ].join("\n"),
        labels: {
          organize: tt("organize"),
          apply: tt("apply"),
          ruleOnly: tt("ruleOnly"),
          noneMissing: tt("noneMissing"),
          validation: tt("validation"),
          stale: tt("stale"),
          noteKept: tt("noteKept"),
          description: tt("description"),
        },
      };
    }
  } catch {
    triageUnavailable = true;
  }
  const raw = await searchParams,
    backHref = applicationQueueReturnHref(locale, raw?.returnTo);
  const href =
    localizedPath(locale, "/admin/members/queue/" + id) +
    "?" +
    new URLSearchParams({ returnTo: backHref });
  const draftRequest = {
    localReviewPath: href,
    enabled:
      process.env.ADMIN_AI_APPLICATION_DRAFTS_ENABLED === "true" &&
      process.env.AGENTS_ENABLED === "true",
    action: prepareApplicationDraftAction.bind(null, id, locale),
    labels: {
      request: tt("draftRequest"),
      requesting: tt("draftRequesting"),
      disabled: tt("draftDisabled"),
      review: tt("draftReview"),
      states: {
        idle: "",
        created: tt("draftCreated"),
        disabled: tt("draftDisabled"),
        configuration: tt("draftConfiguration"),
        busy: tt("draftBusy"),
        unknown: tt("draftUnknown"),
        stale: tt("draftStale"),
        forbidden: tt("draftForbidden"),
        unavailable: tt("draftUnavailable"),
        invalid: tt("draftInvalid"),
      },
    },
  };
  const reviewEnabled = process.env.ADMIN_AI_DRAFTS_ENABLED === "true";
  const reviewT = await getTranslations({ locale, namespace: "AiDraftReview" });
  const reviewLabels = Object.fromEntries(
    Object.keys((await import("@/messages/en.json")).default.AiDraftReview).map(
      (key) => [key, reviewT(key as keyof typeof en.AiDraftReview)],
    ),
  ) as AiDraftReviewLabels;
  let draftDetail: Awaited<
      ReturnType<typeof aiDraftsRepository.getDraft>
    > | null = null,
    reviewUnavailable = false;
  const selected = z.string().uuid().safeParse(raw?.draft);
  if (selected.success) {
    if (!reviewEnabled) reviewUnavailable = true;
    else
      try {
        const details = await aiDraftsRepository.getDraft(actor, selected.data);
        if (details.draft.kind === "application" && details.draft.caseId === id)
          draftDetail = details;
        else reviewUnavailable = true;
      } catch {
        reviewUnavailable = true;
      }
  }
  const adoptionLabels = {
    adopt: tt("adopt"),
    pending: tt("adopting"),
    description: tt("adoptDescription"),
    saveFirst: tt("saveFirst"),
    states: {
      idle: "",
      adopted: tt("adopted"),
      disabled: tt("draftDisabled"),
      stale: tt("draftStale"),
      forbidden: tt("draftForbidden"),
      invalid: tt("draftInvalid"),
      unavailable: tt("adoptUnavailable"),
    },
  };
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  });
  return (
    <div className="space-y-6">
      <Link
        className="inline-flex min-h-11 items-center text-primary underline"
        href={backHref}
      >
        {t("applicationCase.back")}
      </Link>
      <header className="space-y-3">
        <h1 className="font-serif text-4xl">{t("applicationCase.title")}</h1>
        <Link
          className="text-primary underline"
          href={localizedPath(
            locale,
            "/admin/members/" +
              encodeURIComponent(record.application.profileId),
          )}
        >
          {record.application.name}
        </Link>
        <p className="break-all text-sm text-muted-foreground">
          {record.application.id}
        </p>
      </header>
      <dl className="grid gap-4 rounded-md border p-5 sm:grid-cols-3">
        <div>
          <dt className="font-medium">{t("applicationQueue.application")}</dt>
          <dd>
            {record.application.status === "draft"
              ? t("applicationQueue.draft")
              : record.application.status === "completed"
                ? t("applicationCase.applicationCompleted")
                : record.application.status === "abandoned"
                  ? t("applicationCase.applicationAbandoned")
                  : t(`members.statusCodes.${record.application.status}`)}
          </dd>
        </div>
        <div>
          <dt className="font-medium">{t("applicationQueue.billing")}</dt>
          <dd>
            {record.payment
              ? t(`applicationQueue.billingStates.${record.payment.state}`)
              : t("applicationCase.noPayment")}
          </dd>
        </div>
        <div>
          <dt className="font-medium">{t("applicationQueue.membership")}</dt>
          <dd>
            {record.membership
              ? t(`members.statusCodes.${record.membership.status}`)
              : t("applicationQueue.none")}
          </dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">
        {t("applicationCase.independent")}
      </p>
      {triageUnavailable ? (
        <p role="status" className="text-sm">
          {tt("unavailable")}
        </p>
      ) : null}
      <ApplicationCaseForm
        draftRequest={draftRequest}
        triageProposal={triageProposal}
        record={record}
        owners={owners}
        labels={labels}
        action={updateApplicationCaseAction.bind(null, id, locale)}
        refreshHref={href}
      />
      {reviewUnavailable ? <p role="status">{tt("draftUnavailable")}</p> : null}
      {draftDetail ? (
        <>
          <AiReviewPanel
            key={`${draftDetail.draft.id}:${draftDetail.draft.version}`}
            details={draftDetail}
            labels={reviewLabels}
            enabled={reviewEnabled}
          />
          <ApplicationDraftAdopt
            key={draftDetail.draft.id}
            enabled={
              reviewEnabled &&
              draftDetail.draft.state === "approved" &&
              draftDetail.factsAvailable &&
              draftDetail.violations.length === 0
            }
            input={{
              draftId: draftDetail.draft.id,
              expectedVersion: draftDetail.draft.version,
              expectedCaseVersion: record.version,
            }}
            action={adoptApplicationDraftAction.bind(null, id, locale)}
            labels={adoptionLabels}
          />
        </>
      ) : null}
      <section className="space-y-4 rounded-md border p-5">
        <h2 className="font-serif text-2xl">{t("applicationCase.timeline")}</h2>
        {record.timeline.length === 0 ? (
          <p>{t("applicationCase.noHistory")}</p>
        ) : (
          <ol className="space-y-4">
            {record.timeline.map((item) => (
              <li key={item.id} className="border-b pb-4">
                <time dateTime={item.at}>{date.format(new Date(item.at))}</time>
                <p>
                  {t(`applicationCase.nextActions.${item.case.nextActionCode}`)}
                </p>
                {item.note ? (
                  <p className="whitespace-pre-wrap text-sm">{item.note}</p>
                ) : null}
                <p className="text-sm text-muted-foreground">
                  {t("applicationCase.owner")}:{" "}
                  {owners.find((owner) => owner.id === item.case.ownerProfileId)
                    ?.name ?? t("applicationCase.unassigned")}
                </p>
                {item.case.missingFields.length ? (
                  <p>
                    {t("applicationCase.missing")}:{" "}
                    {item.case.missingFields
                      .map((field) =>
                        t(`applicationCase.missingFields.${field}`),
                      )
                      .join("、")}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
