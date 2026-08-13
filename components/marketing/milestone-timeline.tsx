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
    <div className="container mx-auto px-6 py-16 sm:py-24">
      <ol className="space-y-16">
        {years.map(({year, milestones: yearMilestones}) => (
          <li key={year}>
            <h2 className="text-3xl font-semibold sm:text-4xl">{year}</h2>
            <ul className="mt-8 space-y-10 border-l pl-8">
              {yearMilestones.map((milestone) => (
                <li key={milestone.slug}>
                  <h3 className="text-xl font-semibold">
                    {locale === "en" ? milestone.titleEn : milestone.titleZh}
                  </h3>
                  {milestone.featured ? (
                    <p className="mt-3">
                      <Link className="font-semibold text-primary" href={`/about/history/${milestone.slug}`}>
                        {readMoreLabel}
                      </Link>
                    </p>
                  ) : (
                    <div className="mt-3 space-y-3 text-muted-foreground">
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
  );
}
