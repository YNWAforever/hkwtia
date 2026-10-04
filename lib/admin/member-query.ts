import {createHash} from "node:crypto";

import {z} from "zod";

import {MEMBERSHIP_PLAN_CODES, MEMBERSHIP_STATUSES} from "@/lib/membership/constants";

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}, "INVALID_HONG_KONG_DATE");
const statusSchema = z.array(z.enum(MEMBERSHIP_STATUSES)).max(MEMBERSHIP_STATUSES.length).default([]).transform((values) => [...new Set(values)].sort());
const planSchema = z.array(z.enum(MEMBERSHIP_PLAN_CODES)).max(MEMBERSHIP_PLAN_CODES.length).default([]).transform((values) => [...new Set(values)].sort());
const cursorTextSchema = z.string().min(1).max(500).regex(/^[A-Za-z0-9_-]+$/);
const cursorPayloadSchema = z.object({v: z.literal(2), sortKey: z.string().max(300), profileId: z.string().min(1).max(200), fingerprint: z.string().length(24)}).strict();

const queryObject = z.object({
  search: z.string().trim().max(120).default(""),
  status: statusSchema,
  planCode: planSchema,
  renewalFrom: daySchema.nullable().default(null),
  renewalTo: daySchema.nullable().default(null),
  companyId: z.string().uuid().nullable().default(null),
  locale: z.enum(["en", "zh-HK"]).nullable().default(null),
  completeness: z.enum(["any", "incomplete", "complete"]).default("any"),
  sort: z.enum(["name_asc", "name_desc", "renewal_asc"]).default("name_asc"),
  limit: z.coerce.number().int().min(1).max(50).default(50),
  cursor: cursorTextSchema.nullable().default(null),
}).strict();

export type AdminMemberQuery = z.infer<typeof queryObject>;

/** Compare a selected Hong Kong civil day as a half-open UTC range. */
export function hongKongDayStartUtc(value: string, nextDay = false): Date {
  const day = daySchema.parse(value);
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, date! + (nextDay ? 1 : 0), -8));
}

export function memberQueryFingerprint(query: Pick<AdminMemberQuery, "search" | "status" | "planCode" | "renewalFrom" | "renewalTo" | "companyId" | "locale" | "completeness" | "sort">): string {
  const canonical = {search: query.search.toLocaleLowerCase("en"), status: [...query.status].sort(), planCode: [...query.planCode].sort(), renewalFrom: query.renewalFrom, renewalTo: query.renewalTo, companyId: query.companyId, locale: query.locale, completeness: query.completeness, sort: query.sort};
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 24);
}

export type AdminMemberCursor = Readonly<{sortKey: string; profileId: string}>;

export function decodeAdminMemberCursor(cursor: string | null, query?: AdminMemberQuery): AdminMemberCursor | null {
  if (!cursor) return null;
  try {
    cursorTextSchema.parse(cursor);
    const parsed = cursorPayloadSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    if (query && parsed.fingerprint !== memberQueryFingerprint(query)) throw new Error("INVALID_CURSOR");
    return {sortKey: parsed.sortKey, profileId: parsed.profileId};
  } catch {
    throw new Error("INVALID_CURSOR");
  }
}

export function encodeAdminMemberCursor(item: Readonly<{displayName: string; profileId: string; sortKey?: string}>, query?: AdminMemberQuery): string {
  const scope = query ?? queryObject.parse({});
  const sortKey = item.sortKey ?? item.displayName.toLocaleLowerCase("en");
  return Buffer.from(JSON.stringify(cursorPayloadSchema.parse({v: 2, sortKey, profileId: item.profileId, fingerprint: memberQueryFingerprint(scope)})), "utf8").toString("base64url");
}

export const adminMemberCursorSchema = cursorTextSchema.superRefine((cursor, context) => {
  try { decodeAdminMemberCursor(cursor); } catch { context.addIssue({code: z.ZodIssueCode.custom, message: "Invalid member cursor"}); }
});

export const adminMemberQuerySchema = queryObject.superRefine((query, context) => {
  if (query.renewalFrom && query.renewalTo && query.renewalFrom > query.renewalTo) context.addIssue({code: z.ZodIssueCode.custom, path: ["renewalTo"], message: "INVALID_RENEWAL_WINDOW"});
  if (query.cursor) {
    try { decodeAdminMemberCursor(query.cursor, query); }
    catch { context.addIssue({code: z.ZodIssueCode.custom, path: ["cursor"], message: "INVALID_CURSOR"}); }
  }
});

const routeList = z.union([z.string(), z.array(z.string())]).optional().transform((value) => value === undefined || value === "" ? [] : (Array.isArray(value) ? value : [value]));
const routeNullable = z.string().optional().transform((value) => value === undefined || value === "" ? null : value);
export const adminMemberRouteQuerySchema = z.object({
  q: z.string().optional(), status: routeList, planCode: routeList,
  renewalFrom: routeNullable, renewalTo: routeNullable, companyId: routeNullable,
  locale: routeNullable, completeness: z.string().optional(), sort: z.string().optional(),
  limit: z.union([z.string(), z.number()]).optional(), cursor: routeNullable,
  history: z.string().optional(),
}).strict().transform(({q, history, ...rest}) => {
  void history;
  return adminMemberQuerySchema.parse({search: q, ...rest});
});

export function parseAdminMemberRouteQuery(input: unknown): AdminMemberQuery {
  return adminMemberRouteQuerySchema.parse(input);
}
