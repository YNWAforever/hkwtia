import type {ShowcaseListing} from "@/lib/db/server-schema";

type Action = (formData: FormData) => void | Promise<void>;
export type ShowcaseReviewLabels = Readonly<{caption: string; company: string; slug: string; status: string; premium: string; publish: string; reject: string; rejectionReason: string; savePremium: string}>;

export function ShowcaseReviewTable({listings, labels, publishAction, rejectAction, premiumAction}: Readonly<{
  listings: readonly ShowcaseListing[];
  labels: ShowcaseReviewLabels;
  publishAction: Action;
  rejectAction: Action;
  premiumAction: Action;
}>) {
  return <section className="glass-card overflow-x-auto p-5 sm:p-8"><table className="w-full min-w-[760px] text-left text-sm"><caption className="mb-4 text-left font-serif text-2xl font-semibold">{labels.caption}</caption><thead><tr className="border-b border-border/70 text-muted-foreground"><th className="px-3 py-3">{labels.company}</th><th className="px-3 py-3">{labels.slug}</th><th className="px-3 py-3">{labels.status}</th><th className="px-3 py-3">{labels.premium}</th><th className="px-3 py-3">{labels.publish}</th><th className="px-3 py-3">{labels.reject}</th></tr></thead><tbody>{listings.map((listing) => <tr className="border-b border-border/50 align-top" key={listing.id}><td className="px-3 py-4 font-medium">{listing.nameEn}</td><td className="px-3 py-4">{listing.slug}</td><td className="px-3 py-4">{listing.status}</td><td className="px-3 py-4"><form action={premiumAction} className="flex items-center gap-2"><input name="listingId" type="hidden" value={listing.id}/><input aria-label={`${labels.premium}: ${listing.slug}`} defaultChecked={listing.premium} name="premium" type="checkbox"/><button className="underline" type="submit">{labels.savePremium}</button></form></td><td className="px-3 py-4">{listing.status === "pending_review" ? <form action={publishAction}><input name="listingId" type="hidden" value={listing.id}/><button className="rounded-md bg-primary px-3 py-2 text-primary-foreground" type="submit">{labels.publish}</button></form> : "—"}</td><td className="px-3 py-4">{listing.status === "pending_review" ? <form action={rejectAction} className="space-y-2"><input name="listingId" type="hidden" value={listing.id}/><label className="sr-only" htmlFor={`reason-${listing.id}`}>{labels.rejectionReason}</label><textarea className="min-h-16 w-40 rounded-md border border-input bg-background p-2" id={`reason-${listing.id}`} name="rejectionReason" required/><button className="rounded-md border border-input px-3 py-2" type="submit">{labels.reject}</button></form> : "—"}</td></tr>)}</tbody></table></section>;
}
