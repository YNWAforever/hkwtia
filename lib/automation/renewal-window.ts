import { JOURNEYS } from "@/config/journeys";
import {
  addHongKongDays,
  hongKongDateKey,
  WHOLE_DAY_MILLISECONDS,
} from "@/lib/automation/hong-kong-time";
import type { RenewalEnrollmentWindow } from "@/lib/db/repos/renewal-enrollments";
const leadDays = Math.max(...JOURNEYS.renewal.map((step) => -step.offsetDays));
export const RENEWAL_MAX_WINDOW_MS = (leadDays + 1) * WHOLE_DAY_MILLISECONDS;
export function renewalWindow(
  now: Date,
  limit: number,
): RenewalEnrollmentWindow {
  if (!Number.isFinite(now.getTime()))
    throw Error("INVALID_RECONCILIATION_TIME");
  const from = new Date(hongKongDateKey(now) + "T00:00:00+08:00");
  return {
    from,
    to: addHongKongDays(from, leadDays + 1),
    statuses: ["active", "past_due"],
    after: null,
    limit,
  };
}
export type RenewalRunLimits = Readonly<{
  pageSize: number;
  maxPages: number;
  budgetMs: number;
}>;
export function renewalRunLimits(
  env: Readonly<Record<string, string | undefined>> = process.env,
): RenewalRunLimits {
  function integer(key: string, fallback: number, max: number) {
    const raw = env[key];
    if (raw === undefined) return fallback;
    if (!/^\d+$/.test(raw)) throw Error("INVALID_RENEWAL_RUN_LIMIT");
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > max)
      throw Error("INVALID_RENEWAL_RUN_LIMIT");
    return value;
  }
  return {
    pageSize: integer("RENEWAL_ENROLLMENT_PAGE_SIZE", 250, 500),
    maxPages: integer("RENEWAL_ENROLLMENT_MAX_PAGES", 20, 100),
    budgetMs: integer("RENEWAL_ENROLLMENT_BUDGET_MS", 6000, 7000),
  };
}
export function renewalInstanceKey(membershipId: string, end: Date): string {
  return `period:${membershipId}:${end.toISOString()}`;
}
