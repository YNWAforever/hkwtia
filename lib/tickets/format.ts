import type {AppLocale} from "@/i18n/routing";

/**
 * The one place an integer HKD-cents amount becomes money on the public page.
 * `cents` is nullable because `PublicEventProjection.ticketPriceHkdCents` is,
 * even though the database refuses a ticketed event without a positive price;
 * an absent value renders as zero rather than as `null` to the reader.
 */
export function formatTicketPrice(cents: number | null, locale: AppLocale): string {
  return new Intl.NumberFormat(locale, {style: "currency", currency: "HKD"}).format((cents ?? 0) / 100);
}
