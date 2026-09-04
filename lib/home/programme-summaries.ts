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
}>;

// content/programs/index.ts is route identity only (id/namespace/image); the factual record --
// including how many editions exist -- lives in the typed record per programme. CPAI is a
// credential with no editions (content/schemas.ts cpaiProgramSchema's own comment).
export function summarizeProgrammes(): readonly ProgrammeSummary[] {
  return programs.map((record) => {
    if (record.id === 'cpai') {
      return {...record, type: 'credential', editionCount: null, latestYear: null};
    }
    if (record.id === 'hkict') {
      return {...record, type: 'event-series', editionCount: hkict.editions.length, latestYear: Math.max(...hkict.editions.map((edition) => edition.year))};
    }
    if (record.id === 'tct') {
      return {...record, type: 'event-series', editionCount: tct.editions.length, latestYear: Math.max(...tct.editions.map((edition) => edition.year))};
    }
    return {...record, type: 'event-series', editionCount: asa.editions.length, latestYear: Math.max(...asa.editions.map((edition) => edition.yearStart))};
  });
}
