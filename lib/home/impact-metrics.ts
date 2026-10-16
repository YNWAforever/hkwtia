import 'server-only';

import {asa} from '@/content/programs/asa';
import {eventsRepository} from '@/lib/db/repos/events';
import {partnersRepository} from '@/lib/db/repos/partners';
import {ANONYMOUS_ACTOR} from '@/lib/membership/lifecycle';

export type ImpactDateTile = Readonly<{value: number; asOf: Date}>;
export type ImpactYearTile = Readonly<{value: number; year: number}>;
export type ImpactMetrics = Readonly<{
  pastEvents: ImpactDateTile | null;
  publishedPartners: ImpactDateTile | null;
  asaRegions: ImpactYearTile | null;
}>;

// D-8: every value is computed at request time; a tile with value 0 or a rejected read is
// omitted rather than printed as a hard-coded figure like the donor's 17/2/79.
function latestRecordedAsaEdition() {
  const recorded = asa.editions.filter((edition) => edition.regions.kind !== 'unrecorded');
  if (recorded.length === 0) return null;
  return recorded.reduce((latest, edition) => (edition.yearStart > latest.yearStart ? edition : latest));
}

export async function loadImpactMetrics(asOf: Date = new Date()): Promise<ImpactMetrics> {
  const [pastEventsResult, partnersResult] = await Promise.allSettled([
    eventsRepository.countPublic(ANONYMOUS_ACTOR, {status: 'past', asOf}),
    partnersRepository.listPublished('en', {limit: 100, asOf}),
  ]);

  const pastEvents = pastEventsResult.status === 'fulfilled' && pastEventsResult.value > 0
    ? {value: pastEventsResult.value, asOf}
    : null;
  const publishedPartners = partnersResult.status === 'fulfilled' && partnersResult.value.length > 0
    ? {value: partnersResult.value.length, asOf}
    : null;

  // The tile reports reach/scale, not the audit's attended-vs-co-organised distinction, so it
  // deliberately collapses the schema's stricter two-measurement `regions` union (see the "never
  // flattened into one number" comment in content/schemas.ts) into a single "regions represented"
  // figure for whichever edition was most recently recorded.
  const latestAsa = latestRecordedAsaEdition();
  const asaRegions = latestAsa && latestAsa.regions.kind !== 'unrecorded'
    ? {value: latestAsa.regions.count, year: latestAsa.yearStart}
    : null;

  return {pastEvents, publishedPartners, asaRegions};
}
