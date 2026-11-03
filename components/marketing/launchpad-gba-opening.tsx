import {PageHero} from '@/components/wt/page-hero';
import {Shell} from '@/components/wt/shell';

export type LaunchpadGbaOpeningLabels = Readonly<{
  eyebrow: string;
  title: string;
  lead: string;
  breadcrumbHome: string;
  breadcrumbLabel: string;
  breadcrumbCurrent: string;
  opening: Readonly<{eyebrow: string; title: string; copy: string}>;
}>;

// Soft landing, buyer matching and GZ/SZ itineraries are unpublished. A5, 2026-11-03.
// The opening is the held sentence only: no route map and no service cards.
export function LaunchpadGbaOpening({labels}: Readonly<{labels: LaunchpadGbaOpeningLabels}>) {
  return (
    <>
      <PageHero
        eyebrow={labels.eyebrow}
        title={labels.title}
        lead={labels.lead}
        breadcrumb={{homeHref: '/', homeLabel: labels.breadcrumbHome, current: labels.breadcrumbCurrent}}
        breadcrumbLabel={labels.breadcrumbLabel}
      />
      <section className="section">
        <Shell>
          <p className="eyebrow">{labels.opening.eyebrow}</p>
          <h2>{labels.opening.title}</h2>
          <p>{labels.opening.copy}</p>
        </Shell>
      </section>
    </>
  );
}
