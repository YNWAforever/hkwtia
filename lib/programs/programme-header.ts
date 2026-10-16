import type {ProgrammeSummary} from '@/lib/home/programme-summaries';

export type ProgrammeHeaderFacts = Readonly<{typeLabel: string; fact: string; mailSubject: string}>;

// Reuses summarizeProgrammes()'s own editionCount/firstYear/type rather than recomputing
// them: the homepage's programme-showcase card and this page's own header describe the exact
// same fact about the exact same programme, so both read it from one place. The fact states
// the span from the *first* edition ("10 editions since 2013"), matching
// components/marketing/programme-grid.tsx (card fixed in 03904e3; this header was missed and
// read "since 2025" until Phase A, audit F20).
export function buildProgrammeHeaderFacts(
  summary: ProgrammeSummary,
  t: (key: string, values?: Record<string, string | number>) => string,
  programmeName: string
): ProgrammeHeaderFacts {
  const typeLabel = summary.type === 'credential' ? t('credentialLabel') : t('eventSeriesLabel');
  const fact =
    summary.type === 'credential'
      ? t('credentialFact')
      : t('editionsFact', {count: summary.editionCount ?? 0, year: summary.firstYear ?? ''});
  return {typeLabel, fact, mailSubject: t('mailSubject', {programme: programmeName})};
}
