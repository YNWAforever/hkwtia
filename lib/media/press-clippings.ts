import {z} from 'zod';

import droppedArticleUrls from '@/content/media-and-press/dropped-article-urls.json';
import liveClippings from '@/content/media-and-press/live-clippings.json';

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
