import "server-only";

import {z} from "zod";

import type {AppLocale} from "@/i18n/routing";
import {requireAdmin} from "@/lib/auth/actor";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {
  automationAdminRepository,
  type AutomationDashboardRepositoryQuery,
} from "@/lib/db/repos/automation-admin";
import {JourneyTransitionError} from "@/lib/db/repos/journeys";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

export const AUTOMATION_DEFAULT_PAGE_LIMIT = 25;
export const AUTOMATION_MAX_PAGE_LIMIT = 50;

export type AutomationDashboard = Readonly<{
  asOf: string;
  counts: Readonly<{
    due: number;
    upcoming: number;
    failed: number;
    processing: number;
  }>;
  jobs: readonly Readonly<{
    kind: string;
    state: string;
    updatedAt: string;
    errorCode: string | null;
  }>[];
  rows: readonly Readonly<{
    id: string;
    journey: string;
    step: string;
    status: string;
    scheduledAt: string;
    attemptCount: number;
    errorCode: string | null;
    retryable: boolean;
  }>[];
  nextCursor: string | null;
}>;

export type AutomationDashboardReader = Readonly<{
  getDashboard: (
    actor: AdminActor,
    query: AutomationDashboardRepositoryQuery,
  ) => Promise<AutomationDashboard>;
}>;

export type AutomationRetryWriter = Readonly<{
  retryFailed: (
    actor: AdminActor,
    journeyId: string,
    scheduledAt: Date,
  ) => Promise<unknown>;
}>;

export type RetryAutomationActionState = Readonly<{
  status?: "success" | "error";
  code?: "scheduled" | "validation" | "unavailable" | "error";
}>;

type RetryAutomationActionOptions = Readonly<{
  actor: Actor;
  now: () => Date;
  retry: AutomationRetryWriter["retryFailed"];
  onSuccess?: (locale: AppLocale) => void;
}>;

const dashboardQuerySchema = z.object({
  limit: z.union([
    z.string().regex(/^[1-9]\d*$/),
    z.number().int(),
  ]).optional(),
  cursor: z.string().min(1).max(512).optional(),
});

const retryFormSchema = z.object({
  journeyId: z.string().uuid(),
  locale: z.enum(["en", "zh-HK"]),
});

function parseDashboardQuery(input: unknown): Readonly<{
  cursor: string | null;
  limit: number;
}> {
  const parsed = dashboardQuerySchema.parse(input);
  const limit = parsed.limit === undefined
    ? AUTOMATION_DEFAULT_PAGE_LIMIT
    : Number(parsed.limit);
  if (
    !Number.isInteger(limit)
    || limit < 1
    || limit > AUTOMATION_MAX_PAGE_LIMIT
  ) {
    throw new Error("INVALID_AUTOMATION_QUERY");
  }
  return {cursor: parsed.cursor ?? null, limit};
}

export async function getAutomationDashboard(
  actor: Actor,
  query: unknown,
  reader: AutomationDashboardReader = automationAdminRepository,
  asOf = new Date(),
): Promise<AutomationDashboard> {
  requireAdmin(actor);
  if (Number.isNaN(asOf.getTime())) {
    throw new Error("INVALID_AUTOMATION_AS_OF");
  }
  return reader.getDashboard(actor, {
    asOf,
    ...parseDashboardQuery(query),
  });
}

export async function retryAutomation(
  actor: Actor,
  journeyId: string,
  scheduledAt: Date,
  writer: AutomationRetryWriter = automationAdminRepository,
): Promise<unknown> {
  requireAdmin(actor);
  return writer.retryFailed(actor, journeyId, scheduledAt);
}

export async function runRetryAutomationAction(
  _previousState: RetryAutomationActionState,
  formData: FormData,
  options: RetryAutomationActionOptions,
): Promise<RetryAutomationActionState> {
  requireAdmin(options.actor);
  const parsed = retryFormSchema.safeParse({
    journeyId: formData.get("journeyId"),
    locale: formData.get("locale"),
  });
  if (!parsed.success) return {status: "error", code: "validation"};

  try {
    const scheduledAt = options.now();
    if (Number.isNaN(scheduledAt.getTime())) {
      return {status: "error", code: "error"};
    }
    await options.retry(options.actor, parsed.data.journeyId, scheduledAt);
    options.onSuccess?.(parsed.data.locale);
    return {status: "success", code: "scheduled"};
  } catch (error) {
    if (isAuthorizationDenial(error)) throw error;
    if (
      error instanceof JourneyTransitionError
      || (
        error
        && typeof error === "object"
        && "code" in error
        && error.code === "INVALID_TRANSITION"
      )
    ) {
      return {status: "error", code: "unavailable"};
    }
    return {status: "error", code: "error"};
  }
}
