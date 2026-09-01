import type {MilestoneRecord} from "@/content/schemas";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import {byYearDescending} from "@/lib/history/milestones";

type MilestoneTimelineProps = Readonly<{
  locale: AppLocale;
  readMoreLabel: string;
  milestones: readonly MilestoneRecord[];
}>;

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
                {yearMilestones.map((milestone) => (
                  <li className="relative" key={milestone.slug}>
                    <span
                      aria-hidden="true"
                      className="absolute -left-[2.35rem] top-2 size-3 rounded-full bg-shell-blue sm:-left-[2.85rem]"
                    />
                    <h3 className="editorial-serif text-xl font-semibold text-shell-ink sm:text-2xl">
                      {locale === "en" ? milestone.titleEn : milestone.titleZh}
                    </h3>
                    {milestone.featured ? (
                      <p className="mt-4">
                        <Link
                          className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
                          href={`/about/history/${milestone.slug}`}
                        >
                          {readMoreLabel}
                        </Link>
                      </p>
                    ) : (
                      <div className="mt-4 max-w-3xl space-y-3 leading-relaxed text-muted-foreground">
                        {(locale === "en" ? milestone.bodyEn : milestone.bodyZh)
                          .split("\n\n")
                          .map((paragraph, index) => (
                            // Paragraphs belong to one frozen content record and never reorder, so
                            // an index key is stable for this list's lifetime.
                            <p key={index}>{paragraph}</p>
                          ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
