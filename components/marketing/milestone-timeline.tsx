import type {MilestoneRecord} from "@/content/schemas";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import {byYearDescending} from "@/lib/history/milestones";
import {readableMilestoneBody} from "@/lib/history/readable-body";

type MilestoneTimelineProps = Readonly<{
  locale: AppLocale;
  readMoreLabel: string;
  milestones: readonly MilestoneRecord[];
  /** "{count} milestones" for a folded year's summary; the page passes History.compass.milestonesValue. */
  countLabel?: (count: number) => string;
}>;

/**
 * Round 24 (owner decision 2026-10-10): 68 milestones over 17 years made /about/history the
 * longest page on a phone, 17,454px. The newest years stay open; every older year is one native
 * <details> row showing its year and how many milestones it holds. Native, so it opens without
 * JavaScript, and its entries stay in the HTML for search engines and find-in-page.
 */
const OPEN_YEARS = 3;

/**
 * A body this short reads as a caption and is complete inline, with no link to a page that
 * would only repeat it. Anything longer previews its lead and links on: the full bodies
 * inline made /about/history 36,000px tall on a phone (two records run 6,500 and 9,300
 * characters), and every milestone has its own page (generateStaticParams in ./[slug]).
 * The limit is about four lines on a phone. A CJK character is about two and a half Latin
 * ones wide (17 against 45 to a 390px line), so it counts 2.5: by raw length, 150 characters
 * of Chinese passed as short and ran to ten lines.
 */
const INLINE_BODY_LIMIT = 200;

function visualLength(text: string): number {
  return [...text].reduce((total, char) => total + (/[　-鿿＀-￯]/u.test(char) ? 2.5 : 1), 0);
}

function isCompleteInline(paragraphs: readonly string[]): boolean {
  return paragraphs.length <= 1 && visualLength(paragraphs[0] ?? "") <= INLINE_BODY_LIMIT;
}

/**
 * The preview is the first paragraph with substance. Some records open with a salutation or a
 * tag ("Dear Partners and Friends,", "[PRESS RELEASE]"), and press releases repeat their own
 * headline as the first paragraph, which under that headline says nothing.
 */
const PREVIEW_MIN_LENGTH = 40;

function previewOf(paragraphs: readonly string[], title: string): string | undefined {
  const plain = (text: string) => text.replace(/^\[[^\]]*\]\s*/u, "").replace(/\s+/gu, " ").trim();
  const heading = plain(title);
  return paragraphs.find((paragraph) =>
    visualLength(paragraph) >= PREVIEW_MIN_LENGTH && !heading.startsWith(plain(paragraph)) && !plain(paragraph).startsWith(heading),
  ) ?? paragraphs[0];
}

function ReadMore({href, label}: Readonly<{href: string; label: string}>) {
  return (
    <p className="mt-4">
      <Link
        className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
        href={href}
      >
        {label}
      </Link>
    </p>
  );
}

function YearEntries({locale, readMoreLabel, milestones}: Readonly<{locale: AppLocale; readMoreLabel: string; milestones: readonly MilestoneRecord[]}>) {
  return (
    <ul className="space-y-10 border-l border-shell-blue/20 pl-8 sm:pl-10">
      {milestones.map((milestone) => {
        const paragraphs = readableMilestoneBody(locale === "en" ? milestone.bodyEn : milestone.bodyZh);
        const href = `/about/history/${milestone.slug}`;
        const title = locale === "en" ? milestone.titleEn : milestone.titleZh;
        return (
          <li className="relative" key={milestone.slug}>
            <span
              aria-hidden="true"
              className="absolute -left-[2.35rem] top-2 size-3 rounded-full bg-shell-blue sm:-left-[2.85rem]"
            />
            <h3 className="editorial-serif text-xl font-semibold text-shell-ink sm:text-2xl">
              {title}
            </h3>
            {milestone.featured ? (
              <ReadMore href={href} label={readMoreLabel} />
            ) : isCompleteInline(paragraphs) ? (
              <p className="mt-4 max-w-3xl leading-relaxed text-muted-foreground">{paragraphs[0]}</p>
            ) : (
              <>
                <p className="mt-4 line-clamp-3 max-w-3xl leading-relaxed text-muted-foreground">
                  {previewOf(paragraphs, title)}
                </p>
                <ReadMore href={href} label={readMoreLabel} />
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Presentational only -- renders whatever list it receives, in the requested
 * locale. It does not filter by `kind`: the page applies `milestonesOnly`
 * before handing entries down, so the filtering rule stays testable on its
 * own instead of being buried inside a render function.
 */
export function MilestoneTimeline({locale, readMoreLabel, milestones, countLabel = String}: MilestoneTimelineProps) {
  const years = byYearDescending(milestones);
  const open = years.slice(0, OPEN_YEARS);
  const folded = years.slice(OPEN_YEARS);

  return (
    <div className="bg-shell-warm py-16 sm:py-24">
      <div className="container mx-auto px-6">
        <ol className="space-y-16 sm:space-y-20">
          {open.map(({year, milestones: yearMilestones}) => (
            <li className="grid gap-8 lg:grid-cols-[10rem_minmax(0,1fr)]" key={year}>
              <h2 className="editorial-serif text-3xl font-semibold text-shell-ink sm:text-4xl">
                {year}
              </h2>
              <YearEntries locale={locale} milestones={yearMilestones} readMoreLabel={readMoreLabel} />
            </li>
          ))}
        </ol>
        {folded.length ? (
          <ol className="mt-16 border-t border-shell-blue/15 sm:mt-20">
            {folded.map(({year, milestones: yearMilestones}) => (
              <li className="border-b border-shell-blue/15" key={year}>
                <details className="group">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center gap-4 py-3 [&::-webkit-details-marker]:hidden">
                    <h2 className="editorial-serif text-2xl font-semibold text-shell-ink sm:text-3xl">{year}</h2>
                    <span className="text-sm text-muted-foreground">{countLabel(yearMilestones.length)}</span>
                    <svg aria-hidden="true" className="ml-auto size-5 shrink-0 text-shell-blue transition-transform group-open:rotate-180 motion-reduce:transition-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </summary>
                  <div className="pb-10 pt-4 lg:pl-[10rem]">
                    <YearEntries locale={locale} milestones={yearMilestones} readMoreLabel={readMoreLabel} />
                  </div>
                </details>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  );
}
