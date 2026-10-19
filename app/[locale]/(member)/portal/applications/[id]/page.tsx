import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {PrivateLink} from "@/components/internal-shell/private-link";
import {ApplicationReadRetry} from "@/components/portal/application-read-retry";
import {PortalPageHeader} from "@/components/portal/page-header";
import type {AppLocale} from "@/i18n/routing";
import {getMemberApplication} from "@/lib/portal/applications";
import type {MemberApplicationView} from "@/lib/portal/applications";
import {
  memberApplicationActionHref,
  memberApplicationDetailHref,
} from "@/lib/portal/application-links";
import {formatPortalDateTime} from "@/lib/portal/format-date";
import {portalPageActor} from "@/lib/portal/page-actor";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";

type Props = Readonly<{params: Promise<{locale: string; id: string}>}>;

export default async function ApplicationDetailPage({params}: Props) {
  const {locale: localeValue, id} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await portalPageActor(locale, `/portal/applications/${encodeURIComponent(id)}`);
  const t = await getTranslations({locale, namespace: "Portal"});

  let application: MemberApplicationView | null;
  try {
    application = await getMemberApplication(actor, id);
  } catch {
    console.error("PORTAL_APPLICATION_READ_FAILED");
    return (
      <ApplicationReadRetry
        title={t("applications.unavailableTitle")}
        message={t("applications.unavailableCopy")}
        retryHref={memberApplicationDetailHref(locale, id)}
        retryLabel={t("applications.retry")}
        dashboardHref={localizedPath(locale, "/portal")}
        dashboardLabel={t("applications.dashboard")}
      />
    );
  }
  if (!application) notFound();

  const actionHref = memberApplicationActionHref(locale, application);
  let actionTitle: string;
  let actionBody: string | null = null;
  let actionLabel: string | null = null;
  switch (application.nextAction) {
    case "resume":
      actionTitle = t("applications.nextAction.resume.title");
      actionLabel = t("applications.nextAction.resume.action");
      break;
    case "billing":
      actionTitle = t("applications.nextAction.billing.title");
      actionLabel = t("applications.nextAction.billing.action");
      break;
    case "wait":
      actionTitle = t("applications.nextAction.wait.title");
      actionBody = t("applications.nextAction.wait.body");
      break;
    case "complete":
      actionTitle = t("applications.nextAction.complete.title");
      actionBody = t("applications.nextAction.complete.body");
      break;
    case "new":
      actionTitle = t("applications.nextAction.new.title");
      actionLabel = t("applications.nextAction.new.action");
      break;
  }

  return (
    <div className="space-y-6">
      <PrivateLink className="inline-flex min-h-11 items-center text-primary underline" href={localizedPath(locale, "/portal/applications")}>
        {t("applications.back")}
      </PrivateLink>

      <PortalPageHeader
        eyebrow={t("applications.nav")}
        title={t(`plans.${application.planCode}`)}
        lead={t("applications.description")}
      >
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-border px-3 py-1 text-sm font-medium">
            {t(`applications.status.${application.status}`)}
          </span>
          <span className="text-sm text-muted-foreground">
            {t("applications.updated", {date: formatPortalDateTime(locale, application.updatedAt)})}
          </span>
        </div>
      </PortalPageHeader>

      <section className="glass-card space-y-4 p-5 sm:p-6" aria-labelledby="application-overview">
        <h2 id="application-overview" className="font-serif text-2xl font-semibold">{t("applications.title")}</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium">{t("applications.reference")}</dt>
            <dd className="break-all text-muted-foreground">{application.id}</dd>
          </div>
          <div>
            <dt className="font-medium">{t("applications.stepLabel")}</dt>
            <dd className="text-muted-foreground">{t(`applications.step.${application.step}`)}</dd>
          </div>
          <div>
            <dt className="font-medium">{t("applications.createdLabel")}</dt>
            <dd className="text-muted-foreground">{formatPortalDateTime(locale, application.createdAt)}</dd>
          </div>
          <div>
            <dt className="font-medium">{t("applications.updatedLabel")}</dt>
            <dd className="text-muted-foreground">{formatPortalDateTime(locale, application.updatedAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="glass-card space-y-3 p-5 sm:p-6" aria-labelledby="application-missing">
        <h2 id="application-missing" className="font-serif text-2xl font-semibold">{t("applications.missingTitle")}</h2>
        {application.missing.length > 0 ? (
          <ul className="list-disc space-y-1 ps-5">
            {application.missing.map((item) => (
              <li key={item}>{t(`applications.missing.${item}`)}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">{t("applications.missingNone")}</p>
        )}
      </section>

      <section className="glass-card space-y-3 p-5 sm:p-6" aria-labelledby="application-next">
        <h2 id="application-next" className="font-serif text-2xl font-semibold">{t("applications.nextTitle")}</h2>
        <p className="font-medium">{actionTitle}</p>
        {actionBody ? <p className="text-muted-foreground">{actionBody}</p> : null}
        {actionHref && actionLabel ? (
          <PrivateLink
            className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            href={actionHref}
          >
            {actionLabel}
          </PrivateLink>
        ) : null}
      </section>
    </div>
  );
}
