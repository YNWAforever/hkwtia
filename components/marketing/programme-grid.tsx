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

// The donor's .programme-grid (app/styles/wisetech.css:216-225), shared by home section 8 and
// /programmes so the two can never drift. A plain <Link> is used for the CTA rather than
// ActionLink: `.programme-card>a` styles a bare child anchor directly.
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
            {programme.type === 'credential'
              ? labels.credentialFact
              : labels.editionsFact(programme.editionCount ?? 0, programme.latestYear ?? 0)}
          </small>
          <Link href={`/programs/${programme.id}`}>{labels.action} <Arrow /></Link>
        </article>
      ))}
    </div>
  );
}
