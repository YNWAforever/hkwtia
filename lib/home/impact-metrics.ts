import 'server-only';

import {asa} from '@/content/programs/asa';
import {eventsRepository} from '@/lib/db/repos/events';
import {partnersRepository} from '@/lib/db/repos/partners';

const anonymous = {kind: 'anonymous', userId: null} as const;

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
    eventsRepository.listPublic(anonymous, {status: 'past', asOf, locale: 'en', limit: 500}),
    partnersRepository.listPublished('en', {limit: 100, asOf}),
  ]);

  const pastEvents = pastEventsResult.status === 'fulfilled' && pastEventsResult.value.length > 0
    ? {value: pastEventsResult.value.length, asOf}
    : null;
  const publishedPartners = partnersResult.status === 'fulfilled' && partnersResult.value.length > 0
    ? {value: partnersResult.value.length, asOf}
    : null;

  const latestAsa = latestRecordedAsaEdition();
  const asaRegions = latestAsa && latestAsa.regions.kind !== 'unrecorded'
    ? {value: latestAsa.regions.count, year: latestAsa.yearStart}
    : null;

  return {pastEvents, publishedPartners, asaRegions};
}
