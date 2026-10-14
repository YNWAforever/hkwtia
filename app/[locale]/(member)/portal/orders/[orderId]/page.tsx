import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";
import {PrivateLink} from "@/components/internal-shell/private-link";
import {OrderRecovery} from "@/components/portal/order-recovery";
import {PortalPageHeader} from "@/components/portal/page-header";
import type {AppLocale} from "@/i18n/routing";
import {portalPageActor} from "@/lib/portal/page-actor";
import {getMyOrder} from "@/lib/portal/my-orders";
import {formatPortalDate} from "@/lib/portal/format-date";
import {formatTicketPrice} from "@/lib/tickets/format";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";
type Props = Readonly<{params: Promise<{locale: string; orderId: string}>; searchParams?: Promise<Record<string, string | string[] | undefined>>}>;

export default async function OrderPage({params}: Props) {
  const {locale: language, orderId} = await params;
  const locale = language as AppLocale;
  setRequestLocale(locale);
  const actor = await portalPageActor(locale, `/portal/orders/${orderId}`);
  const order = await getMyOrder(actor, orderId);
  if (!order) notFound();
  const t = await getTranslations({locale, namespace: "Portal"});
  return <div className="space-y-6">
    <PortalPageHeader eyebrow={t("orders.title")} title={locale === "zh-HK" && order.titleZh ? order.titleZh : order.titleEn} lead={formatPortalDate(locale, order.startsAt)} />
    <p role="status">{t(`orders.status.${order.status}`)}</p>
    <p>{t("orders.amount", {amount: formatTicketPrice(order.amountHkdCents, locale)})}</p>
    {order.status === "pending" ? <>
      <p>{t("orders.processing")}</p>
      <OrderRecovery eventId={order.eventId} orderId={order.id} labels={{resume: t("orders.resume"), pending: t("orders.checking"), unavailable: t("orders.recoveryUnavailable"), completed: t("orders.processing"), expired: t("orders.recoveryExpired")}} />
    </> : null}
    <div className="flex flex-wrap gap-3">
      <PrivateLink className="portal-button-outline" href={localizedPath(locale, `/portal/orders/${order.id}`)}>{t("orders.refresh")}</PrivateLink>
      <PrivateLink className="text-link" href={localizedPath(locale, "/portal/events")}>{t("events.title")}</PrivateLink>
      <PrivateLink className="text-link" href={localizedPath(locale, "/contact")}>{t("orders.support")}</PrivateLink>
    </div>
  </div>;
}
