import {Arrow} from '@/components/wt/arrow';
import {CardIndex} from '@/components/wt/card-index';
import {StatusLabel} from '@/components/wt/status-label';
import {Link} from '@/i18n/navigation';
import type {ProgrammeSummary} from '@/lib/home/programme-summaries';

export type ProgrammeGridLabels = Readonly<{
  eventSeriesLabel: string;
  credentialLabel: string;
  credentialFact: string;
  editionsFact: (count: number, year: number) => string;
  action: string;
  items: Readonly<Record<ProgrammeSummary['id'], Readonly<{name: string; description: string}>>>;
}>;

// The donor's .programme-grid (app/styles/wisetech.css:216-226), shared by home section 8 and
// /programmes so the two can never drift. A plain <Link> is used for the CTA rather than
// ActionLink: app/styles/wisetech.css:226 `.programme-card>a` styles a bare child anchor
// directly (border-top, its own flex layout) and defines no `.text-link`/`.button` rule for
// this container, so ActionLink's variant class would double-style the anchor.
export function ProgrammeGrid({summaries, labels}: Readonly<{summaries: readonly ProgrammeSummary[]; labels: ProgrammeGridLabels}>) {
  return (
    <div className="programme-grid">
      {summaries.map((programme, index) => (
        <article className={index === 0 ? 'programme-card feature' : 'programme-card'} key={programme.id}>
          <div>
            <StatusLabel>{programme.type === 'credential' ? labels.credentialLabel : labels.eventSeriesLabel}</StatusLabel>
            <CardIndex index={index + 1} />
          </div>
          <h3>{labels.items[programme.id].name}</h3>
          <p>{labels.items[programme.id].description}</p>
          <small>
            {/* Cards count editions since the FIRST year, not the latest (a programme running
                2020-2025 reads "since 2020", not "since 2025"). The editions-fact branch narrows
                on `firstYear !== null` rather than falling back with `?? 0`: every event series
                is guaranteed a firstYear (>= 1 recorded edition), so the narrowing is provably
                always true there, and a credential (firstYear: null) never reaches it. */}
            {programme.type !== 'credential' && programme.firstYear !== null
              ? labels.editionsFact(programme.editionCount ?? 0, programme.firstYear)
              : labels.credentialFact}
          </small>
          <Link href={`/programs/${programme.id}`}>{labels.action} <Arrow /></Link>
        </article>
      ))}
    </div>
  );
}
