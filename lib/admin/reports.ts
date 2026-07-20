import "server-only";

import {z} from "zod";

import {reconcileReportFacts, REPORT_TIMEZONE, type AdminReport, type RawReportFacts, type ReportDisplayWindow} from "@/lib/admin/report-formulas";
import {requireAdmin} from "@/lib/auth/actor";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).superRefine((value, context) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month! - 1 || date.getUTCDate() !== day) {
    context.addIssue({code: z.ZodIssueCode.custom, message: "invalid calendar date"});
  }
});

export const reportWindowSchema = z.object({from: calendarDateSchema, to: calendarDateSchema}).strict();

export type ReportUtcWindow = Readonly<{from: Date; toExclusive: Date}>;
export type ParsedReportWindow = Readonly<{display: ReportDisplayWindow; utc: ReportUtcWindow}>;
export type ReportFactsReader = Readonly<{
  readFacts: (actor: AdminActor, window: ReportUtcWindow) => Promise<RawReportFacts>;
}>;

function hongKongStartOfDayUtc(value: string, nextDay = false): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + (nextDay ? 1 : 0), -8));
}

export function parseReportWindow(input: unknown): ParsedReportWindow {
  const {from, to} = reportWindowSchema.parse(input);
  const utc = {from: hongKongStartOfDayUtc(from), toExclusive: hongKongStartOfDayUtc(to, true)};
  if (utc.from >= utc.toExclusive) throw new z.ZodError([{code: z.ZodIssueCode.custom, path: ["to"], message: "to must be on or after from"}]);
  return {display: {from, to, timezone: REPORT_TIMEZONE}, utc};
}

const defaultReader: ReportFactsReader = {
  readFacts: async (actor, window) => (await import("@/lib/db/repos/reports")).reportsRepository.readFacts(actor, window),
};

export async function getAdminReport(actor: Actor, input: unknown, reader: ReportFactsReader = defaultReader): Promise<AdminReport> {
  requireAdmin(actor);
  const window = parseReportWindow(input);
  const facts = await reader.readFacts(actor, window.utc);
  return reconcileReportFacts(facts, window.display);
}
