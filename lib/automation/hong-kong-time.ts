export const HONG_KONG_UTC_OFFSET_MINUTES = 8 * 60;
export const WHOLE_DAY_MILLISECONDS = 86_400_000;

/** Hong Kong uses UTC+08:00 year-round, so calendar-day offsets are exact whole days. */
export const addHongKongDays = (instant: Date, days: number): Date =>
  new Date(instant.getTime() + days * WHOLE_DAY_MILLISECONDS);
