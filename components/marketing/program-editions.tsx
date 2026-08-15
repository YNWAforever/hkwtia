import Image from 'next/image';

import type {ProgramImage, ProgramWinners} from '@/content/schemas';

/**
 * One edition, with every string already localised.
 *
 * The pages resolve their own copy and hand it over, which is the convention
 * every other component in this directory follows (see program-detail.tsx).
 * It also keeps the funder sentence where it belongs: three archive shapes --
 * a body with its scheme, a body alone, a scheme with no body -- pick three
 * different message keys, and that choice is a fact about the edition rather
 * than a rendering concern.
 */
export type EditionView = {
  heading: string;
  /** Attribution, regions, shape: whichever the archive supports, in order. */
  lines: readonly string[];
  /**
   * Omitted entirely for a series that has no winners to record. TCT is not an
   * awards programme, so rendering "the archive does not record the winners"
   * against its editions would assert winners that never existed — a different
   * error from the one `unrecorded` exists to avoid, and a worse one, because
   * it is the page inventing a category rather than declining to fill one.
   */
  winners?: LocalisedWinners;
  images: readonly {src: string; alt: string}[];
};

export type LocalisedWinners =
  | {kind: 'listed'; entries: readonly {name: string; category: string}[]}
  | {kind: 'off-site'; url: string}
  | {kind: 'unrecorded'};

type ProgramEditionsProps = {
  editionsHeading: string;
  winnersHeading: string;
  categoryHeading: string;
  winnersOffSite: string;
  winnersOffSiteLink: string;
  winnersUnrecorded: string;
  editions: readonly EditionView[];
};

/** Picks the locale's half of each bilingual winner field. */
export function localiseWinners(winners: ProgramWinners, zh: boolean): LocalisedWinners {
  if (winners.kind !== 'listed') return winners;
  return {
    kind: 'listed',
    entries: winners.entries.map((entry) => ({
      name: zh ? entry.nameZh : entry.nameEn,
      category: zh ? entry.categoryZh : entry.categoryEn
    }))
  };
}

export function localiseImages(
  images: readonly ProgramImage[],
  zh: boolean
): readonly {src: string; alt: string}[] {
  return images.map((image) => ({src: image.src, alt: zh ? image.altZh : image.altEn}));
}

export function ProgramEditions({
  editionsHeading,
  winnersHeading,
  categoryHeading,
  winnersOffSite,
  winnersOffSiteLink,
  winnersUnrecorded,
  editions
}: ProgramEditionsProps) {
  return (
    <section className="container mx-auto px-6 py-16">
      <h2 className="text-2xl font-semibold">{editionsHeading}</h2>
      <ol className="mt-8 space-y-12">
        {editions.map((edition) => (
          <li key={edition.heading} className="glass-card p-6">
            <h3 className="text-xl font-semibold">{edition.heading}</h3>

            {edition.lines.map((line) => (
              <p key={line} className="text-muted-foreground mt-2">
                {line}
              </p>
            ))}

            {edition.winners ? (
              <Winners
                categoryHeading={categoryHeading}
                offSite={winnersOffSite}
                offSiteLink={winnersOffSiteLink}
                unrecorded={winnersUnrecorded}
                winners={edition.winners}
                winnersHeading={winnersHeading}
              />
            ) : null}

            {edition.images.length > 0 ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {edition.images.map((image) => (
                  <Image
                    key={image.src}
                    alt={image.alt}
                    className="h-auto w-full rounded-lg"
                    height={427}
                    src={image.src}
                    width={640}
                  />
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Absence is shown as absence.
 *
 * Where the archive defers to a microsite the page links out; where it records
 * nothing it says so. Neither case renders an empty table, which would read as
 * "nobody won" — and for six of ASA's ten editions and four of HKICT's six,
 * that would be a claim the archive does not support.
 */
function Winners({
  categoryHeading,
  offSite,
  offSiteLink,
  unrecorded,
  winners,
  winnersHeading
}: {
  categoryHeading: string;
  offSite: string;
  offSiteLink: string;
  unrecorded: string;
  winners: LocalisedWinners;
  winnersHeading: string;
}) {
  if (winners.kind === 'unrecorded') {
    return <p className="text-muted-foreground mt-4">{unrecorded}</p>;
  }

  if (winners.kind === 'off-site') {
    return (
      <p className="text-muted-foreground mt-4">
        {offSite}{' '}
        {/* An external microsite, so a bare <a> is correct — localizedPath and
            next-intl's Link are for our own routes only. */}
        <a className="underline" href={winners.url} rel="noreferrer" target="_blank">
          {offSiteLink}
        </a>
      </p>
    );
  }

  return (
    <table className="mt-4 w-full text-left">
      <thead>
        <tr>
          <th className="py-2" scope="col">
            {winnersHeading}
          </th>
          <th className="py-2" scope="col">
            {categoryHeading}
          </th>
        </tr>
      </thead>
      <tbody>
        {winners.entries.map((entry) => (
          <tr key={`${entry.name}-${entry.category}`} className="border-t">
            <td className="py-2">{entry.name}</td>
            <td className="py-2">{entry.category}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
