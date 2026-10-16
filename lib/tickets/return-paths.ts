import type {AppLocale} from "@/i18n/routing";
import {ticketPurchaseAudience} from "@/lib/tickets/eligibility";
import {localizedPath} from "@/lib/urls";

export function ticketReturnPaths(event: Readonly<{slug: string; visibility: string; memberOnly: boolean}>, orderId: string, locale: AppLocale) {
  const audience = ticketPurchaseAudience(event);
  if (audience === "invite_only") throw new Error("NOT_ELIGIBLE");
  const path = localizedPath(locale, audience === "members_only" ? `/portal/orders/${encodeURIComponent(orderId)}` : `/events/${encodeURIComponent(event.slug)}`);
  return {successPath: `${path}?ticket=received`, cancelPath: `${path}?ticket=cancelled`};
}
