import "server-only";

import {createHash} from "node:crypto";
import {z} from "zod";

import type {AppLocale} from "@/i18n/routing";
import {parseSegmentRouteQuery, type SegmentFilterSet, type SegmentPreviewInput} from "@/lib/admin/segment-schema";
import {localizedPath} from "@/lib/urls";

const boundSchema = z.object({
  scope: z.string().regex(/^[a-f0-9]{64}$/),
  cursor: z.string().min(1).max(500),
  offset: z.number().int().min(0).max(10_000_000),
}).strict();
type Position = Readonly<{cursor: string | null; offset: number; valid: boolean}>;

function scopeFor(filter: SegmentFilterSet, limit: number): string {
  // List order does not alter the audience. Parse first, then canonicalize lists.
  const canonical = Object.fromEntries(Object.entries(filter).map(([key, value]) =>
    [key, Array.isArray(value) ? [...value].sort() : value]));
  return createHash("sha256").update(JSON.stringify({filter: canonical, limit})).digest("hex");
}

/** A fingerprint prevents stale navigation. It never establishes actor or eligibility. */
export function segmentCursorPosition(filter: SegmentFilterSet, limit: number, value: string | null): Position {
  if (!value) return {cursor: null, offset: 0, valid: true};
  try {
    const bound = boundSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    if (bound.scope === scopeFor(filter, limit)) return {cursor: bound.cursor, offset: bound.offset, valid: true};
  } catch { /* Legacy or malformed navigation restarts at the first page. */ }
  return {cursor: null, offset: 0, valid: false};
}

export function bindSegmentCursor(filter: SegmentFilterSet, limit: number, cursor: string, offset: number): string {
  return Buffer.from(JSON.stringify(boundSchema.parse({scope: scopeFor(filter, limit), cursor, offset})), "utf8").toString("base64url");
}

export function parseSegmentPageQuery(raw: Record<string, string | string[] | undefined>): {
  query: SegmentPreviewInput; history: readonly (string | null)[]; offset: number;
} {
  const filters = {...raw};
  delete filters.history;
  delete filters.campaignDraft;
  const query = parseSegmentRouteQuery(filters);
  const position = segmentCursorPosition(query.filter, query.limit, query.cursor);
  let history: readonly (string | null)[] = [];
  if (position.valid && query.cursor && typeof raw.history === "string" && raw.history.length <= 16000) {
    try {
      const values = z.array(z.string().max(1200).nullable()).max(10).parse(JSON.parse(Buffer.from(raw.history, "base64url").toString("utf8")));
      if (values.every(cursor => segmentCursorPosition(query.filter, query.limit, cursor).valid)) history = values;
    } catch { /* Invalid navigation history is discarded. */ }
  }
  return {query: {...query, cursor: position.valid ? query.cursor : null}, history, offset: position.offset};
}

export function segmentPageHref(
  locale: AppLocale, query: SegmentPreviewInput, draftId: string,
  history: readonly (string | null)[] = [], cursor: string | null = query.cursor,
): string {
  z.string().uuid().parse(draftId);
  const params = new URLSearchParams();
  const filter = query.filter;
  const lists = {profileId: filter.profileIds, tier: filter.tier, status: filter.status,
    industryTag: filter.industryTags, companyPlan: filter.companyPlan,
    contactStage: filter.contactStage, contactSource: filter.contactSource};
  for (const [name, values] of Object.entries(lists)) for (const value of values) params.append(name, value);
  const scalars = {scoreMin: filter.scoreMin, scoreMax: filter.scoreMax,
    renewalWithinDays: filter.renewalWithinDays, sector: filter.sector,
    lastLoginBeforeDays: filter.lastLoginBeforeDays, whatsappOptIn: filter.whatsappOptIn,
    audience: filter.audience, eventId: filter.event?.eventId, eventState: filter.event?.state};
  for (const [name, value] of Object.entries(scalars)) {
    if (value !== undefined && value !== null && value !== "") params.set(name, String(value));
  }
  params.set("limit", String(query.limit));
  params.set("campaignDraft", draftId);
  if (cursor) params.set("cursor", cursor);
  // Keep URLs bounded; the first-page link remains available beyond this window.
  if (history.length) params.set("history", Buffer.from(JSON.stringify(history.slice(-10)), "utf8").toString("base64url"));
  return localizedPath(locale, "/admin/segments") + "?" + params.toString();
}
