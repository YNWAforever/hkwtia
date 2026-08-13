import type {Metadata} from "next";
import Image from "next/image";
import {setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {milestones} from "@/content/milestones";
import type {MilestoneRecord} from "@/content/schemas";
import type {AppLocale} from "@/i18n/routing";
import {featuredOnly, findBySlug, milestonesOnly} from "@/lib/history/milestones";
import {buildPageMetadata} from "@/lib/metadata";

type Props = {params: Promise<{locale: string; slug: string}>};

/**
 * Only `kind: "milestone"` belongs in WTIA's own record -- member stories and
 * press releases have their own homes (see milestonesOnly's comment in
 * lib/history/milestones), neither is WTIA's own institutional history -- and
 * only `featured` entries are substantial enough to earn a standalone page. A
 * two-sentence entry would be thin content, which is exactly what
 * /about/history's inline timeline rendering exists to avoid.
 */
export function generateStaticParams() {
  return featuredOnly(milestonesOnly(milestones)).map(({slug}) => ({slug}));
}

/**
 * Shared by generateMetadata and the page. `kind` and `featured` are
 * re-checked here rather than trusted from generateStaticParams because
 * dynamicParams defaults to true: a direct request for a real but
 * non-featured milestone, or for a member-story/press-release slug, still
 * reaches this function and must fail to resolve rather than render a page
 * the timeline never links to.
 */
function resolveFeaturedMilestone(slug: string): MilestoneRecord | null {
  const milestone = findBySlug(milestones, slug);
  return milestone && milestone.kind === "milestone" && milestone.featured ? milestone : null;
}

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale, slug} = await params;
  const milestone = resolveFeaturedMilestone(slug);
  if (!milestone) return {};

  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: `/about/history/${slug}`,
    title: locale === "zh-HK" ? milestone.titleZh : milestone.titleEn,
    description: (locale === "zh-HK" ? milestone.bodyZh : milestone.bodyEn).slice(0, 160),
  });
}

// No `dynamic` export: like /about/history, this reads typed content bundled
// at build time, not a database, so static prerendering is correct and can
// never go stale.
export default async function HistoryDetailPage({params}: Props) {
  const {locale, slug} = await params;
  const milestone = resolveFeaturedMilestone(slug);
  if (!milestone) notFound();
  setRequestLocale(locale);

  const title = locale === "zh-HK" ? milestone.titleZh : milestone.titleEn;
  const body = locale === "zh-HK" ? milestone.bodyZh : milestone.bodyEn;

  return (
    <article className="container mx-auto px-6 py-16 sm:py-24">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{milestone.year}</p>
      <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-tight sm:text-6xl">{title}</h1>
      <div className="mt-8 max-w-3xl space-y-6 text-lg leading-relaxed text-muted-foreground">
        {body.split("\n\n").map((paragraph, index) => (
          // Paragraphs belong to one frozen content record and never
          // reorder, so an index key is stable for this page's lifetime.
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      {milestone.images.length > 0 ? (
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {milestone.images.map((image) => (
            <div key={image.src} className="relative aspect-[4/3] overflow-hidden rounded-lg">
              <Image
                src={image.src}
                alt={locale === "zh-HK" ? image.altZh : image.altEn}
                fill
                sizes="(min-width: 640px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}
