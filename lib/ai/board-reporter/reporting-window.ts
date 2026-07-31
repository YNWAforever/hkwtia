import type {ReportDisplayWindow} from "@/lib/admin/report-formulas";
import type {ReportUtcWindow} from "@/lib/admin/reports";

const HONG_KONG_OFFSET_MS = 8 * 60 * 60 * 1_000;

export type BoardReportingWindow = Readonly<{
  reportMonth: string;
  display: ReportDisplayWindow;
  utc: ReportUtcWindow;
}>;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dateText(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function previousHongKongMonthWindow(asOf: Date): BoardReportingWindow {
  if (!Number.isFinite(asOf.getTime())) {
    throw new RangeError("INVALID_REPORTING_INSTANT");
  }

  const hongKongInstant = new Date(asOf.getTime() + HONG_KONG_OFFSET_MS);
  const currentYear = hongKongInstant.getUTCFullYear();
  const currentMonthIndex = hongKongInstant.getUTCMonth();
  const previousMonthStart = new Date(
    Date.UTC(currentYear, currentMonthIndex - 1, 1) - HONG_KONG_OFFSET_MS,
  );
  const currentMonthStart = new Date(
    Date.UTC(currentYear, currentMonthIndex, 1) - HONG_KONG_OFFSET_MS,
  );
  const previousLocalMonth = new Date(Date.UTC(currentYear, currentMonthIndex - 1, 1));
  const previousYear = previousLocalMonth.getUTCFullYear();
  const previousMonth = previousLocalMonth.getUTCMonth() + 1;
  const previousLastDay = new Date(Date.UTC(currentYear, currentMonthIndex, 0)).getUTCDate();
  const toExclusive = currentMonthStart;

  return {
    reportMonth: `${previousYear}-${pad(previousMonth)}`,
    display: {
      from: dateText(previousYear, previousMonth, 1),
      to: dateText(previousYear, previousMonth, previousLastDay),
      timezone: "Asia/Hong_Kong",
    },
    utc: {
      from: previousMonthStart,
      toExclusive,
      asOf: toExclusive,
    },
  };
}
