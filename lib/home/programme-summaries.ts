import {asa} from '@/content/programs/asa';
import {hkict} from '@/content/programs/hkict';
import {programs} from '@/content/programs/index';
import {tct} from '@/content/programs/tct';

export type ProgrammeType = 'event-series' | 'credential';
export type ProgrammeSummary = Readonly<{
  id: 'cpai' | 'hkict' | 'tct' | 'asa';
  namespace: string;
  image: string;
  type: ProgrammeType;
  editionCount: number | null;
  latestYear: number | null;
  firstYear: number | null;
}>;

// content/programs/index.ts is route identity only (id/namespace/image); the factual record --
// including how many editions exist -- lives in the typed record per programme. CPAI is a
// credential with no editions (content/schemas.ts cpaiProgramSchema's own comment).
export function summarizeProgrammes(): readonly ProgrammeSummary[] {
  return programs.map((record) => {
    if (record.id === 'cpai') {
      return {...record, type: 'credential', editionCount: null, latestYear: null, firstYear: null};
    }
    if (record.id === 'hkict') {
      const years = hkict.editions.map((edition) => edition.year);
      return {...record, type: 'event-series', editionCount: hkict.editions.length, latestYear: Math.max(...years), firstYear: Math.min(...years)};
    }
    if (record.id === 'tct') {
      const years = tct.editions.map((edition) => edition.year);
      return {...record, type: 'event-series', editionCount: tct.editions.length, latestYear: Math.max(...years), firstYear: Math.min(...years)};
    }
    const years = asa.editions.map((edition) => edition.yearStart);
    return {...record, type: 'event-series', editionCount: asa.editions.length, latestYear: Math.max(...years), firstYear: Math.min(...years)};
  });
}
