import "server-only";
import {getTranslations} from "next-intl/server";
import type {TicketCheckoutLabels} from "@/components/marketing/ticket-checkout-form";
import type {AppLocale} from "@/i18n/routing";

export async function getTicketCheckoutLabels(locale: AppLocale): Promise<TicketCheckoutLabels> {
  const t = await getTranslations({locale, namespace: "Ticket"});
  return {
    heading: t("heading"), buyerName: t("buyerName"), buyerEmail: t("buyerEmail"), seatCount: t("seatCount"), attendeeName: t("attendeeName"), attendeeEmail: t("attendeeEmail"),
    website: t("website"), submit: t("submit"), submitting: t("submitting"), refundPolicy: t("refundPolicy"), fillBuyer: t("fillBuyer"), removeSeat: t("removeSeat"), total: t("total"), paymentNature: t("paymentNature"), eventDate: t("eventDate"),
    fieldErrors: {required: t("fieldErrors.required"), invalid: t("fieldErrors.invalid"), extra: t("fieldErrors.extra")},
    recoveryLoading: t("recoveryLoading"), recoveryTitle: t("recoveryTitle"), recoverySummary: t("recoverySummary"), recoveryResume: t("recoveryResume"), recoveryChecking: t("recoveryChecking"), recoveryUnavailable: t("recoveryUnavailable"),
    errors: Object.fromEntries(["INVALID", "SOLD_OUT", "NOT_ELIGIBLE", "EVENT_CLOSED", "UNAVAILABLE", "RETRY_CHANGED", "RETRY_EXPIRED", "ALREADY_COMPLETED", "RATE_LIMITED"].map((code) => [code, t(`errors.${code}`)])),
  };
}
