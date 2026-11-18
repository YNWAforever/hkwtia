import {z} from "zod";

import handoff from "@/content/media-and-press/ruby-copy-handoff-20261119T0042+08.json";

export const ZH_SUMMARY_HARD_CAP = 55;
export const EN_SUMMARY_HARD_CAP = 32;

const accessStatusSchema = z.enum([
  "verified_full",
  "verified_lead",
  "pending_blocked",
  "pending_unavailable",
  "pending_listing",
  "pending_fetch_limited",
  "pending_title_only",
]);

const entrySchema = z.object({
  n: z.number().int().positive(),
  url: z.string().min(1),
  status: accessStatusSchema,
  zh: z.string().nullable(),
  en: z.string().nullable(),
  withheld_zh: z.string().nullable(),
  withheld_en: z.string().nullable(),
}).passthrough();

const handoffSchema = z.object({
  schema: z.literal("wtia-ruby-copy-entries-handoff/v1"),
  handoff_id: z.literal("ruby-copy-handoff-20261119T0042+08"),
  counts: z.object({
    live_entries: z.literal(81),
    verified: z.literal(64),
    pending: z.literal(17),
  }).passthrough(),
  editorial_flags: z.object({
    disputed_prior_year_baseline_omitted_from_public_summaries: z.tuple([z.literal(10), z.literal(11), z.literal(14)]),
    scheduled_preview_not_happened_assertion: z.literal(26),
    editorial_inclusion_review: z.tuple([z.literal(36), z.literal(75)]),
    entries_not_removed: z.tuple([z.literal(36), z.literal(75)]),
  }).passthrough(),
  do_not_import: z.array(z.string()).min(1),
  canonical_markdown: z.object({
    snapshot_sha256: z.literal("b3c5f1b62b675b713ab235fb132f34021cceb5a6c56fe124a6d8d6e412580dc8"),
  }).passthrough(),
  entries: z.array(entrySchema).length(81),
}).passthrough();

export type PressAccessStatus = z.infer<typeof accessStatusSchema>;
export type PressInclusionFlag = "topic_hub" | "no_wtia_mention";

export type PressSummaryDraft = Readonly<{
  auditRow: number;
  articleUrl: string;
  accessStatus: PressAccessStatus;
  candidate: boolean;
  zh: string | null;
  en: string | null;
  needsShortening: boolean;
  disputedBaselineInSummary: boolean;
  inclusionFlag: PressInclusionFlag | null;
  urlRepaired: false;
}>;

const WIRE_OUTLET = /pr\s*newswire|media\s*outreach|美通社/i;
const WITHHELD = /^\s*withheld\b/i;
const DISPUTED_BASELINE = /42\s*%|47\s*%/;

export function zhSummaryLength(text: string): number {
  return [...text.replace(/\s+/g, "")].length;
}

export function enSummaryWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

export function summaryNeedsShortening(zh: string, en: string): boolean {
  return zhSummaryLength(zh) > ZH_SUMMARY_HARD_CAP || enSummaryWords(en) > EN_SUMMARY_HARD_CAP;
}

export function pressLinkKind(url: string): "internal-news" | "external" {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "hkwtia.org" && host !== "hkwtia.vercel.app") return "external";
    const path = parsed.pathname.replace(/\/+$/, "");
    if (path === "/news" || path.startsWith("/news/") || /^\/(?:zh|en)\/news(?:\/|$)/.test(parsed.pathname)) {
      return "internal-news";
    }
  } catch {
    return "external";
  }
  return "external";
}

export function isWireOutlet(outlet: string): boolean {
  return WIRE_OUTLET.test(outlet);
}

const parsed = handoffSchema.parse(handoff);
const inclusionRows = new Set<number>(parsed.editorial_flags.editorial_inclusion_review);

export const pressSummarySource = {
  handoffId: parsed.handoff_id,
  canonical: "ruby-copy.md" as const,
  canonicalSha256: parsed.canonical_markdown.snapshot_sha256,
  rejected: parsed.do_not_import,
};

export const pressSummaryDrafts: readonly PressSummaryDraft[] = parsed.entries.map((item) => {
  const candidate = item.zh !== null && item.en !== null;
  const inclusionFlag = item.n === 36 ? "topic_hub" as const : item.n === 75 ? "no_wtia_mention" as const : null;
  return {
    auditRow: item.n,
    articleUrl: item.url,
    accessStatus: item.status,
    candidate,
    zh: candidate ? item.zh : null,
    en: candidate ? item.en : null,
    needsShortening: false,
    disputedBaselineInSummary: false,
    inclusionFlag: inclusionRows.has(item.n) ? inclusionFlag : null,
    urlRepaired: false,
  };
});

export function pressSummaryByUrl(): ReadonlyMap<string, PressSummaryDraft> {
  return new Map(pressSummaryDrafts.map((item) => [item.articleUrl, item]));
}

export type SummaryRender = Readonly<{
  text: string | null;
  status: "draft" | "gap";
  needsShortening: boolean;
  gapReason: PressAccessStatus | null;
}>;

/**
 * Public text is the handoff zh/en pair only. Pending rows stay empty.
 * Rows 10, 11 and 14 must not show the disputed 42%/47% baseline.
 * A proposed length guide does not hide or shorten a draft.
 */
export function summaryForLocale(draft: PressSummaryDraft | undefined, locale: "en" | "zh-HK"): SummaryRender {
  if (!draft || !draft.candidate) {
    return {text: null, status: "gap", needsShortening: false, gapReason: draft?.accessStatus ?? null};
  }
  const text = locale === "zh-HK" ? draft.zh : draft.en;
  const disputedRow = draft.auditRow === 10 || draft.auditRow === 11 || draft.auditRow === 14;
  if (!text || WITHHELD.test(text) || (disputedRow && DISPUTED_BASELINE.test(text))) {
    return {text: null, status: "gap", needsShortening: false, gapReason: draft.accessStatus};
  }
  // Length figures stay measurable for the inventory. They do not withhold or shorten the draft.
  return {text, status: "draft", needsShortening: false, gapReason: null};
}

export function pressSummaryCounts(wallUrls: readonly string[]) {
  const byUrl = pressSummaryByUrl();
  let candidates = 0;
  let integrated = 0;
  let gaps = 0;
  let needsShortening = 0;
  let unmatched = 0;
  for (const url of wallUrls) {
    const draft = byUrl.get(url);
    if (!draft) {
      unmatched += 1;
      gaps += 1;
      continue;
    }
    const render = summaryForLocale(draft, "zh-HK");
    if (draft.candidate) candidates += 1;
    if (render.status === "draft" && render.text) {
      integrated += 1;
      if (render.needsShortening) needsShortening += 1;
    } else gaps += 1;
  }
  return {
    wall: wallUrls.length,
    candidates,
    integrated,
    gaps,
    needsShortening,
    unmatched,
    verifiedAll: false as const,
  };
}
