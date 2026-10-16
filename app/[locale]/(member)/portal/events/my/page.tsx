import {getTranslations, setRequestLocale} from "next-intl/server";
import {PrivateLink} from "@/components/internal-shell/private-link";
import {PortalPageHeader} from "@/components/portal/page-header";
import type {AppLocale} from "@/i18n/routing";
import {portalPageActor} from "@/lib/portal/page-actor";
import {getMyRegistrations} from "@/lib/portal/my-events";
import {formatPortalDate} from "@/lib/portal/format-date";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";
type Props = Readonly<{params: Promise<{locale: string}>; searchParams?: Promise<{cursor?: string | string[]}>}>;
export default async function MyEventsPage({params, searchParams}: Props) {
  const {locale: language} = await params;
  const locale = language as AppLocale;
  setRequestLocale(locale);
  const actor = await portalPageActor(locale, "/portal/events/my");
  const requested = (await searchParams)?.cursor;
  const cursor = typeof requested === "string" ? requested : requested ? "invalid" : undefined;
  const [page, t] = await Promise.all([getMyRegistrations(actor, {cursor}, locale), getTranslations({locale, namespace: "Portal"})]);
  const base = localizedPath(locale, "/portal/events/my");
  return <div className="space-y-6">
    <PortalPageHeader eyebrow={t("navGroups.me")} title={t("myEvents.title")} lead={t("myEvents.description")}/>
    <p>{t("myEvents.passes")}</p>
    {page.cursorReset ? <p role="status">{t("myEvents.cursorReset")}</p> : null}
    {page.items.length ? <ul className="portal-card-grid">{page.items.map((item) => <li className="portal-card" key={`${item.source}:${item.id}`}>
      <p>{t(`myEvents.source.${item.source}`)}</p>
      <h2>{item.title}</h2><p>{formatPortalDate(locale, item.startsAt)}</p>
      <p>{item.source === "ticket" ? t(`orders.status.${item.status}`) : t(`myEvents.rsvpStatus.${item.status}`)}</p>
      {item.eventCancelled ? <p>{t("myEvents.eventCancelled")}</p> : null}
      {item.href ? <PrivateLink className="text-link" href={item.href}>{t(item.source === "ticket" ? "myEvents.viewOrder" : "myEvents.viewEvent")}</PrivateLink> : null}
    </li>)}</ul> : <p>{t("myEvents.empty")}</p>}
    <div className="flex flex-wrap gap-3">
      {cursor ? <PrivateLink className="text-link" href={base}>{t("myEvents.first")}</PrivateLink> : null}
      {page.nextCursor ? <PrivateLink className="text-link" href={`${base}?${new URLSearchParams({cursor: page.nextCursor})}`}>{t("myEvents.next")}</PrivateLink> : null}
      <PrivateLink className="text-link" href={localizedPath(locale, "/portal/events")}>{t("events.title")}</PrivateLink>
      <PrivateLink className="text-link" href={localizedPath(locale, "/contact")}>{t("orders.support")}</PrivateLink>
    </div>
  </div>;
}
