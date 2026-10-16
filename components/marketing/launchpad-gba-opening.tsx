import {CardGrid} from '@/components/wt/card-grid';
import {PageHero} from '@/components/wt/page-hero';
import {RouteMap} from '@/components/wt/route-map';
import {Shell} from '@/components/wt/shell';
import type {WtServiceCard} from '@/components/wt/types';

export type LaunchpadGbaOpeningLabels = Readonly<{
  eyebrow: string;
  title: string;
  lead: string;
  breadcrumbHome: string;
  breadcrumbLabel: string;
  breadcrumbCurrent: string;
  opening: Readonly<{eyebrow: string; title: string; copy: string; map: Readonly<{hk: string; gz: string; sz: string}>}>;
  services: readonly WtServiceCard[];
}>;

// design doc §5 /launchpad: PageHero + .gba-route-board/.route-map (3-node HK/GZ/SZ board,
// reusing RouteMap's 'board' variant -- see components/wt/route-map.tsx for why this differs
// from the homepage's 4-node .gba-map) + .service-grid, 4 descriptive cards with no href
// (explicitly no CTA to a feature that doesn't exist).
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
        <Shell className="gba-route-board">
          <div>
            <p className="eyebrow">{labels.opening.eyebrow}</p>
            <h2>{labels.opening.title}</h2>
            <p>{labels.opening.copy}</p>
          </div>
          <RouteMap variant="board" labels={labels.opening.map} />
        </Shell>
        <CardGrid variant="service" items={labels.services} />
      </section>
    </>
  );
}
