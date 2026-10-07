import type {MilestoneRecord} from "@/content/schemas";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import {byYearDescending} from "@/lib/history/milestones";
import {readableMilestoneBody} from "@/lib/history/readable-body";

type MilestoneTimelineProps = Readonly<{
  locale: AppLocale;
  readMoreLabel: string;
  milestones: readonly MilestoneRecord[];
}>;

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
  return [...text].reduce((total, char) => total + (/[\u3000-\u9fff\uff00-\uffef]/u.test(char) ? 2.5 : 1), 0);
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

/**
 * Presentational only -- renders whatever list it receives, in the requested
 * locale. It does not filter by `kind`: the page applies `milestonesOnly`
 * before handing entries down, so the filtering rule stays testable on its
 * own instead of being buried inside a render function.
 */
export function MilestoneTimeline({locale, readMoreLabel, milestones}: MilestoneTimelineProps) {
  const years = byYearDescending(milestones);

  return (
    <div className="bg-shell-warm py-16 sm:py-24">
      <div className="container mx-auto px-6">
        <ol className="space-y-16 sm:space-y-20">
          {years.map(({year, milestones: yearMilestones}) => (
            <li className="grid gap-8 lg:grid-cols-[10rem_minmax(0,1fr)]" key={year}>
              <h2 className="editorial-serif text-3xl font-semibold text-shell-ink sm:text-4xl">
                {year}
              </h2>
              <ul className="space-y-10 border-l border-shell-blue/20 pl-8 sm:pl-10">
                {yearMilestones.map((milestone) => {
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
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
