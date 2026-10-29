import {getTranslations, setRequestLocale} from "next-intl/server";

import {PrivateLink} from "@/components/internal-shell/private-link";
import {ApplicationReadRetry} from "@/components/portal/application-read-retry";
import {PortalPageHeader} from "@/components/portal/page-header";
import {HonestEmpty} from "@/components/wt/honest-empty";
import type {AppLocale} from "@/i18n/routing";
import {getMemberApplicationsPage} from "@/lib/portal/applications";
import type {MemberApplicationView} from "@/lib/portal/applications";
import {
  memberApplicationActionHref,
  memberApplicationDetailHref,
} from "@/lib/portal/application-links";
import {formatPortalDateTime} from "@/lib/portal/format-date";
import {portalPageActor} from "@/lib/portal/page-actor";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";

type Props = Readonly<{params: Promise<{locale: string}>; searchParams?: Promise<{cursor?: string | string[]}>}>;

export default async function ApplicationsPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await portalPageActor(locale, "/portal/applications");
  const t = await getTranslations({locale, namespace: "Portal"});

  let applications: readonly MemberApplicationView[];
  let nextCursor: string | null;
  let cursor: string | undefined;
  try {
    const query = await searchParams;
    if (Array.isArray(query?.cursor)) throw Error("INVALID_APPLICATION_PAGE");
    cursor = query?.cursor;
    const page = await getMemberApplicationsPage(actor, {cursor});
    applications = page.items;
    nextCursor = page.nextCursor;
  } catch {
    console.error("PORTAL_APPLICATIONS_READ_FAILED");
    return (
      <ApplicationReadRetry
        title={t("applications.unavailableTitle")}
        message={t("applications.unavailableCopy")}
        retryHref={localizedPath(locale, "/portal/applications")}
        retryLabel={t("applications.retry")}
        dashboardHref={localizedPath(locale, "/portal")}
        dashboardLabel={t("applications.dashboard")}
      />
    );
  }

  return (
    <div className="space-y-8">
      <PortalPageHeader
        eyebrow={t("applications.nav")}
        title={t("applications.title")}
        lead={t("applications.description")}
      />

      {applications.length === 0 ? (
        <HonestEmpty
          variant="inner"
          headingLevel={2}
          title={t("applications.emptyTitle")}
          copy={t("applications.emptyCopy")}
          actions={[{href: localizedPath(locale, "/membership"), label: t("applications.emptyAction")}]}
        />
      ) : (
        <ul aria-label={t("applications.title")} className="grid gap-4 xl:grid-cols-2">
          {applications.map((application) => {
            const detailHref = memberApplicationDetailHref(locale, application.id);
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
              <li key={application.id}>
                <article
                  className="glass-card h-full space-y-5 p-5 sm:p-6"
                  data-application-id={application.id}
                >
                  <header className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-primary">{t("applications.nav")}</p>
                      <h2 className="mt-1 font-serif text-2xl font-semibold">{t(`plans.${application.planCode}`)}</h2>
                    </div>
                    <span className="rounded-full border border-border px-3 py-1 text-sm font-medium">
                      {t(`applications.status.${application.status}`)}
                    </span>
                  </header>

                  <p className="text-sm text-muted-foreground">
                    {t("applications.updated", {date: formatPortalDateTime(locale, application.updatedAt)})}
                  </p>

                  {application.missing.length > 0 ? (
                    <section aria-labelledby={`missing-${application.id}`}>
                      <h3 id={`missing-${application.id}`} className="font-medium">{t("applications.missingTitle")}</h3>
                      <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-muted-foreground">
                        {application.missing.map((item) => (
                          <li key={item}>{t(`applications.missing.${item}`)}</li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  <section aria-labelledby={`next-${application.id}`} className="space-y-2">
                    <h3 id={`next-${application.id}`} className="font-medium">{t("applications.nextTitle")}</h3>
                    <p className="font-medium">{actionTitle}</p>
                    {actionBody ? <p className="text-sm text-muted-foreground">{actionBody}</p> : null}
                  </section>

                  <div className="flex flex-wrap gap-3">
                    <PrivateLink className="portal-button-outline min-h-11" href={detailHref}>
                      {t("applications.viewDetails")}
                    </PrivateLink>
                    {actionHref && actionLabel ? (
                      <PrivateLink
                        className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                        href={actionHref}
                      >
                        {actionLabel}
                      </PrivateLink>
                    ) : null}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
      {cursor || nextCursor ? (
        <nav aria-label={t("applications.paging.label")} className="flex flex-wrap gap-3">
          {cursor ? <PrivateLink className="portal-button-outline min-h-11" href={localizedPath(locale, "/portal/applications")}>{t("applications.paging.first")}</PrivateLink> : null}
          {nextCursor ? <PrivateLink className="portal-button-outline min-h-11" href={localizedPath(locale, `/portal/applications?cursor=${encodeURIComponent(nextCursor)}`)}>{t("applications.paging.next")}</PrivateLink> : null}
        </nav>
      ) : null}
    </div>
  );
}
