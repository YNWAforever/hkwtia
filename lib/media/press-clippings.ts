import {z} from 'zod';

import droppedArticleUrls from '@/content/media-and-press/dropped-article-urls.json';
import liveClippings from '@/content/media-and-press/live-clippings.json';
import type {AppLocale} from '@/i18n/routing';
import {
  isWireOutlet,
  pressLinkKind,
  pressSummaryByUrl,
  pressSummaryCounts,
  summaryForLocale,
  type PressInclusionFlag,
  type PressAccessStatus,
} from '@/lib/media/press-summaries';

const clippingSchema = z.object({
  date_as_on_live: z.string(),
  outlet: z.string().min(1),
  title: z.string().min(1),
  article_url: z.string().url(),
}).strict();

const droppedSchema = z.object({
  article_url: z.string().url(),
  http_status: z.literal(404),
  date_as_on_live: z.string().min(1),
  outlet: z.string().min(1),
  title: z.string().min(1),
}).strict();

/**
 * Live wall captured 2026-11-06 (87 rows). Eight scraped hrefs stored `&amp;`
 * from the HTML source; those are decoded to `&` here so the href is the live
 * URL, not a different article. `dropped-article-urls.json` is only rows whose
 * URL returned HTTP 404 on that re-check. Timeouts and other non-404 responses
 * stay on the wall. No replacement URLs are invented.
 */
const source = z.array(clippingSchema).parse(liveClippings);
const dropped = z.array(droppedSchema).parse(droppedArticleUrls);

export type PressClipping = Readonly<{
  dateLabel: string;
  dateTime: string | null;
  outlet: string;
  title: string;
  articleUrl: string;
}>;

/** Live dates are D/M/YYYY. The visible label stays that string; this is only the machine value. */
export function livePressDateTime(dateLabel: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateLabel.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const check = new Date(`${iso}T00:00:00Z`);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) return null;
  return iso;
}

export function listPressClippings(): readonly PressClipping[] {
  const dead = new Set(dropped.map((row) => row.article_url));
  return source
    .filter((row) => !dead.has(row.article_url))
    .map((row) => ({
      dateLabel: row.date_as_on_live,
      dateTime: row.date_as_on_live.trim() === '' ? null : livePressDateTime(row.date_as_on_live),
      outlet: row.outlet,
      title: row.title,
      articleUrl: row.article_url,
    }));
}

export const pressClippingSourceCount = source.length;
export const droppedPressArticles = dropped;

export type PressCard = PressClipping & Readonly<{
  year: string | null;
  distribution: "wire" | "unclassified";
  linkKind: "internal-news" | "external";
  summary: string | null;
  summaryStatus: "draft" | "gap";
  needsShortening: boolean;
  gapReason: PressAccessStatus | null;
  inclusionFlag: PressInclusionFlag | null;
  auditRow: number | null;
}>;

export function listPressCards(locale: AppLocale): readonly PressCard[] {
  const drafts = pressSummaryByUrl();
  return listPressClippings()
    .map((row, index) => {
      const draft = drafts.get(row.articleUrl);
      const summary = summaryForLocale(draft, locale);
      return {
        index,
        card: {
          ...row,
          year: row.dateTime?.slice(0, 4) ?? null,
          distribution: isWireOutlet(row.outlet) ? "wire" as const : "unclassified" as const,
          linkKind: pressLinkKind(row.articleUrl),
          summary: summary.text,
          summaryStatus: summary.status,
          needsShortening: summary.needsShortening,
          gapReason: summary.gapReason,
          inclusionFlag: draft?.inclusionFlag ?? null,
          auditRow: draft?.auditRow ?? null,
        },
      };
    })
    .sort((a, b) => {
      if (a.card.dateTime && b.card.dateTime && a.card.dateTime !== b.card.dateTime) return a.card.dateTime < b.card.dateTime ? 1 : -1;
      if (a.card.dateTime && !b.card.dateTime) return -1;
      if (!a.card.dateTime && b.card.dateTime) return 1;
      return a.index - b.index;
    })
    .map(({card}) => card);
}

export function pressWallSummaryCounts() {
  return pressSummaryCounts(listPressClippings().map((row) => row.articleUrl));
}

/** Publication date only. ZH 2025年11月1日, EN 1 Nov 2025. The calendar day is the wall date, not a fetch time. */
export function formatPressDate(isoDate: string, locale: AppLocale): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  if (locale === "zh-HK") {
    return new Intl.DateTimeFormat("zh-HK", {year: "numeric", month: "long", day: "numeric", timeZone: "UTC"}).format(date);
  }
  return new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short", year: "numeric", timeZone: "UTC"}).format(date);
}
