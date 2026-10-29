import {z} from "zod";

import {MEMBERSHIP_PLAN_CODES} from "@/lib/membership/constants";

/** Ops tiers the importer may write. community/startup/patron stay recommendation-only. */
export const OPS_IMPORT_PLAN_CODES = ["individual", "corporate", "platinum"] as const;
export type OpsImportPlanCode = (typeof OPS_IMPORT_PLAN_CODES)[number];

export type MembershipImportDecision = Readonly<{
  outcome: "would_create_membership" | "would_set_expired" | "contact_only" | "skipped";
  reason: string | null;
  planCode: OpsImportPlanCode | null;
  membershipStatus: "active" | "expired" | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
}>;

export type ImportTally = Readonly<{
  total: number;
  create: number;
  update: number;
  unchanged: number;
  duplicate: number;
  conflict: number;
  invalid: number;
  wouldCreateMembership: number;
  wouldSetExpired: number;
  contactOnly: number;
  skipped: number;
}>;

const decisionSchema = z.object({
  outcome: z.enum(["would_create_membership", "would_set_expired", "contact_only", "skipped"]),
  reason: z.string().nullable(),
  planCode: z.enum(OPS_IMPORT_PLAN_CODES).nullable(),
  membershipStatus: z.enum(["active", "expired"]).nullable(),
  billingPeriodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  billingPeriodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
}).strict();

/** Legacy register keys such as IN00001. They are not profiles.id. */
const LEGACY_MEMBER_KEY = /^IN\d+$/i;

export function isLegacyMemberKey(value: string): boolean {
  return LEGACY_MEMBER_KEY.test(value.trim());
}

export type NormalisedImportTier =
  | Readonly<{kind: "plan"; planCode: OpsImportPlanCode}>
  | Readonly<{kind: "associate"}>
  | Readonly<{kind: "unknown"}>;

/** Capitalised register labels ("Individual") are not plan codes until this runs. */
export function normaliseImportTier(value: string): NormalisedImportTier {
  const token = value.trim().toLowerCase();
  if (token === "associate") return {kind: "associate"};
  if (token === "individual" || token === "corporate" || token === "platinum") return {kind: "plan", planCode: token};
  return {kind: "unknown"};
}

function isoDay(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return value;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function contactOnlyReason(status: string): "FORMER" | "NO_AUTH" | null {
  if (status === "former" || status === "old") return "FORMER";
  if (status === "no-auth" || status === "noauth") return "NO_AUTH";
  return null;
}

/**
 * Classify one mapped row. Associate is skipped before status so a lapsed
 * associate is not written as an expired membership. A missing status stays
 * contact-only: an enabled flag must not invent an active membership.
 */
export function decideMembershipImport(values: Readonly<Record<string, unknown>>): MembershipImportDecision {
  const tierSource = text(values.tier) ?? text(values.planCode);
  const tier = tierSource ? normaliseImportTier(tierSource) : null;
  const status = text(values.membershipStatus)?.toLowerCase().replace(/[\s_]+/g, "-") ?? "";
  const billingPeriodEnd = isoDay(values.expiryAt) ?? isoDay(values.renewAt) ?? isoDay(values.renewalAt);
  const joined = isoDay(values.joinedAt);
  const billingPeriodStart = joined && (!billingPeriodEnd || joined < billingPeriodEnd) ? joined : null;
  const dates = {billingPeriodStart, billingPeriodEnd};
  if (tier?.kind === "associate") return {...dates, outcome: "skipped", reason: "ASSOCIATE_SKIPPED", planCode: null, membershipStatus: null};
  const contactReason = contactOnlyReason(status);
  if (contactReason) return {...dates, outcome: "contact_only", reason: contactReason, planCode: null, membershipStatus: null};
  if (!status) return {...dates, outcome: "contact_only", reason: "STATUS_ABSENT", planCode: null, membershipStatus: null};
  const membershipStatus = status === "active" || status === "current" ? "active" as const : status === "expired" || status === "lapsed" || status === "lapse" ? "expired" as const : null;
  if (!membershipStatus) return {...dates, outcome: "skipped", reason: "STATUS_UNSUPPORTED", planCode: null, membershipStatus: null};
  if (tier?.kind !== "plan") return {...dates, outcome: "skipped", reason: "TIER_UNSUPPORTED", planCode: null, membershipStatus: null};
  if (membershipStatus === "expired") return {...dates, outcome: "would_set_expired", reason: null, planCode: tier.planCode, membershipStatus};
  return {...dates, outcome: "would_create_membership", reason: null, planCode: tier.planCode, membershipStatus};
}

export function normaliseMappedMembershipFields(values: Record<string, unknown>, reasons: string[]): void {
  if (typeof values.tier === "string") {
    const token = normaliseImportTier(values.tier);
    values.tier = token.kind === "plan" ? token.planCode : token.kind === "associate" ? "associate" : values.tier.trim().toLowerCase();
  }
  if (typeof values.planCode === "string") {
    const token = normaliseImportTier(values.planCode);
    if (token.kind === "plan") values.planCode = token.planCode;
    else if (token.kind === "associate") {
      if (values.tier === undefined) values.tier = "associate";
      delete values.planCode;
    } else if (!(MEMBERSHIP_PLAN_CODES as readonly string[]).includes(values.planCode)) reasons.push("PLAN_INVALID");
  }
  if (typeof values.tier === "string" && typeof values.planCode === "string" && values.tier !== values.planCode) reasons.push("TIER_PLAN_MISMATCH");
  if (typeof values.membershipStatus === "string") values.membershipStatus = values.membershipStatus.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

export function readMembershipDecision(values: Readonly<Record<string, unknown>>): MembershipImportDecision | null {
  const parsed = decisionSchema.safeParse(values.membershipDecision);
  if (!parsed.success) return null;
  const decision = parsed.data;
  if (decision.outcome === "would_create_membership" && (decision.planCode === null || decision.membershipStatus !== "active")) return null;
  if (decision.outcome === "would_set_expired" && (decision.planCode === null || decision.membershipStatus !== "expired")) return null;
  if ((decision.outcome === "contact_only" || decision.outcome === "skipped") && (decision.planCode !== null || decision.membershipStatus !== null)) return null;
  return decision;
}

export function membershipDecisionRequiresWrite(decision: MembershipImportDecision | null): boolean {
  return decision?.outcome === "would_create_membership" || decision?.outcome === "would_set_expired";
}

export function sameMembershipDecision(left: MembershipImportDecision, right: MembershipImportDecision): boolean {
  return left.outcome === right.outcome && left.reason === right.reason && left.planCode === right.planCode && left.membershipStatus === right.membershipStatus && left.billingPeriodStart === right.billingPeriodStart && left.billingPeriodEnd === right.billingPeriodEnd;
}

const ROW_STATUSES = ["create", "update", "unchanged", "duplicate", "conflict", "invalid"] as const;

/** Dry-run counters. Skipped rows stay `invalid` in the status check constraint and are counted here instead. */
export function tallyImportRows(rows: readonly {status: string; values: Readonly<Record<string, unknown>>}[]): ImportTally {
  const counts: Record<string, number> = {total: rows.length, create: 0, update: 0, unchanged: 0, duplicate: 0, conflict: 0, invalid: 0, wouldCreateMembership: 0, wouldSetExpired: 0, contactOnly: 0, skipped: 0};
  for (const row of rows) {
    const decision = readMembershipDecision(row.values);
    if (decision?.outcome === "skipped" && row.status !== "duplicate" && row.status !== "conflict") {
      counts.skipped += 1;
      continue;
    }
    if ((ROW_STATUSES as readonly string[]).includes(row.status)) counts[row.status] += 1;
    if (row.status !== "create" && row.status !== "update") continue;
    if (decision?.outcome === "would_create_membership") counts.wouldCreateMembership += 1;
    else if (decision?.outcome === "would_set_expired") counts.wouldSetExpired += 1;
    else if (decision?.outcome === "contact_only") counts.contactOnly += 1;
  }
  return counts as ImportTally;
}
