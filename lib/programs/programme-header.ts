import type {ProgrammeSummary} from '@/lib/home/programme-summaries';

export type ProgrammeHeaderFacts = Readonly<{typeLabel: string; fact: string; mailSubject: string}>;

// Reuses summarizeProgrammes()'s own editionCount/latestYear/type rather than recomputing
// them: the homepage's programme-showcase card and this page's own header describe the exact
// same fact about the exact same programme, so both read it from one place.
export function buildProgrammeHeaderFacts(
  summary: ProgrammeSummary,
  t: (key: string, values?: Record<string, string | number>) => string,
  programmeName: string
): ProgrammeHeaderFacts {
  const typeLabel = summary.type === 'credential' ? t('credentialLabel') : t('eventSeriesLabel');
  const fact =
    summary.type === 'credential'
      ? t('credentialFact')
      : t('editionsFact', {count: summary.editionCount ?? 0, year: summary.latestYear ?? ''});
  return {typeLabel, fact, mailSubject: t('mailSubject', {programme: programmeName})};
}
