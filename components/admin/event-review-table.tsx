import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

/**
 * A member-submitted event as the review queue renders it. The page maps the
 * repository's snake_case `MemberEventRow` onto this shape explicitly so the
 * table never sees a raw database row.
 */
export type ReviewRow = Readonly<{
  id: string;
  slug: string;
  titleEn: string;
  startsAt: Date | null;
  organiser: string | null;
  submittedAt: Date | null;
  format: string;
  visibility: string;
}>;
type Action = (formData: FormData) => void | Promise<void>;
export type EventReviewLabels = Readonly<{caption: string; event: string; organiser: string; starts: string; submitted: string; format: string; visibility: string; approve: string; reject: string; rejectionReason: string; empty: string}>;

export function EventReviewTable({rows, labels, locale, approveAction, rejectAction}: Readonly<{
  rows: readonly ReviewRow[];
  labels: EventReviewLabels;
  locale: AppLocale;
  approveAction: Action;
  rejectAction: Action;
}>) {
  if (rows.length === 0) return <p className="text-muted-foreground">{labels.empty}</p>;
  const formatter = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Hong_Kong"});
  return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><caption className="sr-only">{labels.caption}</caption><thead><tr className="border-b border-border/70 text-muted-foreground"><th className="px-3 py-3">{labels.event}</th><th className="px-3 py-3">{labels.organiser}</th><th className="px-3 py-3">{labels.starts}</th><th className="px-3 py-3">{labels.submitted}</th><th className="px-3 py-3">{labels.format}</th><th className="px-3 py-3">{labels.visibility}</th><th className="px-3 py-3">{labels.approve}</th><th className="px-3 py-3">{labels.reject}</th></tr></thead><tbody>{rows.map((row) => <tr className="border-b border-border/50 align-top" key={row.id}><td className="px-3 py-4 font-medium"><Link className="underline" href={localizedPath(locale, `/admin/events-mgmt/${row.id}`)}>{row.titleEn}</Link><span className="block font-mono text-xs text-muted-foreground">{row.slug}</span></td><td className="px-3 py-4">{row.organiser ?? "—"}</td><td className="px-3 py-4">{row.startsAt ? formatter.format(row.startsAt) : "—"}</td><td className="px-3 py-4">{row.submittedAt ? formatter.format(row.submittedAt) : "—"}</td><td className="px-3 py-4">{row.format}</td><td className="px-3 py-4">{row.visibility}</td><td className="px-3 py-4"><form action={approveAction}><input name="eventId" type="hidden" value={row.id}/><button className="rounded-md bg-primary px-3 py-2 text-primary-foreground" type="submit">{labels.approve}</button></form></td><td className="px-3 py-4"><form action={rejectAction} className="space-y-2"><input name="eventId" type="hidden" value={row.id}/><label className="sr-only" htmlFor={`event-reason-${row.id}`}>{labels.rejectionReason}</label><textarea className="min-h-16 w-40 rounded-md border border-input bg-background p-2" id={`event-reason-${row.id}`} maxLength={1000} name="rejectionReason" required/><button className="rounded-md border border-input px-3 py-2" type="submit">{labels.reject}</button></form></td></tr>)}</tbody></table></div>;
}
