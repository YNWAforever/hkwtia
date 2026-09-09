import Image from "next/image";

import {industryTagLabel} from "@/config/industry-tags";
import type {AppLocale} from "@/i18n/routing";
import {isPrivateMediaDeliveryUrl, isRegistrableMediaUrl} from "@/lib/media/url";

/**
 * A member's public page as the review queue renders it. The page maps the
 * repository's snake_case `CompanyProfileReviewRow` onto this shape explicitly
 * so the table never sees a raw database row.
 */
export type ProfileReviewRow = Readonly<{
  id: string;
  name: string;
  slug: string | null;
  tags: readonly string[];
  website: string | null;
  taglineEn: string | null;
  taglineZhHk: string | null;
  descriptionZhHk: string | null;
  logoUrl: string | null;
}>;
type Action = (formData: FormData) => void | Promise<void>;
export type ProfileReviewLabels = Readonly<{caption: string; company: string; slug: string; tags: string; preview: string; approve: string; reject: string; rejectionReason: string; empty: string; taglineEn: string; taglineZhHk: string; descriptionZhHk: string; website: string; previewEmpty: string}>;

/**
 * The reviewer cannot open the page they are judging — it is `pending_review`,
 * so `/members/[slug]` 404s until they approve it. The `<details>` is therefore
 * the whole preview: every field `/members` will publish, in one place.
 *
 * Its terms come from the bundles rather than from inline `EN`/`ZH` markers so
 * a zh-HK reviewer reads the queue in their own language (CLAUDE.md rule 6).
 */
function ProfilePreview({row, labels}: Readonly<{row: ProfileReviewRow; labels: ProfileReviewLabels}>) {
  const entries = [
    {key: "tagline-en", term: labels.taglineEn, value: row.taglineEn},
    {key: "tagline-zh", term: labels.taglineZhHk, value: row.taglineZhHk},
    {key: "description-zh", term: labels.descriptionZhHk, value: row.descriptionZhHk},
  ].filter((entry) => entry.value !== null);
  // A profile can reach the queue with a slug and nothing else, and a blank
  // `<details>` would read as a rendering fault rather than as thin copy.
  if (entries.length === 0 && row.website === null) {
    return <details className="max-w-sm"><summary className="cursor-pointer underline">{labels.preview}</summary><p className="mt-2 text-xs text-muted-foreground">{labels.previewEmpty}</p></details>;
  }
  return <details className="max-w-sm"><summary className="cursor-pointer underline">{labels.preview}</summary><dl className="mt-2 space-y-2 text-xs">{entries.map((entry) => <div key={entry.key}><dt className="text-muted-foreground">{entry.term}</dt><dd className="whitespace-pre-line">{entry.value}</dd></div>)}
    {/* `nofollow noreferrer`: an unreviewed site must not read our referer or
        borrow our ranking just because a staff reviewer opened it. */}
    {row.website ? <div><dt className="text-muted-foreground">{labels.website}</dt><dd><a className="break-all underline" href={row.website} rel="nofollow noreferrer" target="_blank">{row.website}</a></dd></div> : null}
  </dl></details>;
}

export function ProfileReviewTable({rows, labels, locale, approveAction, rejectAction}: Readonly<{
  rows: readonly ProfileReviewRow[];
  labels: ProfileReviewLabels;
  locale: AppLocale;
  approveAction: Action;
  rejectAction: Action;
}>) {
  if (rows.length === 0) return <p className="text-muted-foreground">{labels.empty}</p>;
  return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><caption className="sr-only">{labels.caption}</caption><thead><tr className="border-b border-border/70 text-muted-foreground"><th className="px-3 py-3">{labels.company}</th><th className="px-3 py-3">{labels.slug}</th><th className="px-3 py-3">{labels.tags}</th><th className="px-3 py-3">{labels.preview}</th><th className="px-3 py-3">{labels.approve}</th><th className="px-3 py-3">{labels.reject}</th></tr></thead><tbody>{rows.map((row) => <tr className="border-b border-border/50 align-top" key={row.id}><td className="px-3 py-4 font-medium"><div className="flex items-start gap-2">{/* Only own-origin references render: next/image throws on an unconfigured
      remote host, and a private-delivery url must skip the optimizer so every
      request still reaches the revocation check on /api/media/[id]. */}
    {row.logoUrl && (isPrivateMediaDeliveryUrl(row.logoUrl) || isRegistrableMediaUrl(row.logoUrl)) ? <Image alt="" className="h-8 w-8 shrink-0 rounded object-contain" height={32} src={row.logoUrl} unoptimized={isPrivateMediaDeliveryUrl(row.logoUrl)} width={32}/> : null}<span>{row.name}</span></div></td><td className="px-3 py-4 font-mono text-xs">{row.slug ?? "—"}</td><td className="px-3 py-4">{row.tags.length === 0 ? "—" : row.tags.map((tag) => industryTagLabel(tag, locale)).join(", ")}</td><td className="px-3 py-4"><ProfilePreview labels={labels} row={row}/></td><td className="px-3 py-4"><form action={approveAction}><input name="companyId" type="hidden" value={row.id}/><button className="rounded-md bg-primary px-3 py-2 text-primary-foreground" type="submit">{labels.approve}</button></form></td><td className="px-3 py-4"><form action={rejectAction} className="space-y-2"><input name="companyId" type="hidden" value={row.id}/><label className="sr-only" htmlFor={`profile-reason-${row.id}`}>{labels.rejectionReason}</label><textarea className="min-h-16 w-40 rounded-md border border-input bg-background p-2" id={`profile-reason-${row.id}`} maxLength={1000} name="rejectionReason" required/><button className="rounded-md border border-input px-3 py-2" type="submit">{labels.reject}</button></form></td></tr>)}</tbody></table></div>;
}
