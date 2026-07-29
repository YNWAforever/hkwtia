export const HONG_KONG_UTC_OFFSET_MINUTES = 8 * 60;
export const WHOLE_DAY_MILLISECONDS = 86_400_000;

const hongKongDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Hong_Kong",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function hongKongDateKey(instant: Date): string {
  const parts = hongKongDateFormatter.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return [
    part("year"),
    part("month"),
    part("day"),
  ].join("-");
}

/** Hong Kong uses UTC+08:00 year-round, so calendar-day offsets are exact whole days. */
export const addHongKongDays = (instant: Date, days: number): Date =>
  new Date(instant.getTime() + days * WHOLE_DAY_MILLISECONDS);
