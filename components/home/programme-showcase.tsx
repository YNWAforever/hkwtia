import {Arrow} from '@/components/wt/arrow';
import {Section} from '@/components/wt/section';
import {SectionHeading} from '@/components/wt/section-heading';
import {Link} from '@/i18n/navigation';
import {flagships, type FlagshipLink} from '@/lib/home/flagships';
import {getHomeTranslations, type HomeCopyProps} from '@/lib/home/copy-preview';

// Home section. The programmes index still renders the four typed records through
// ProgrammeGrid. This strip is the five flagships from the 2026-11-06 copy gate,
// including InsidW, which has no programme page to share with that grid.
export async function ProgrammeShowcase({locale, copyOverrides}: HomeCopyProps) {
  const t = await getHomeTranslations({locale, copyOverrides, namespace: 'Home.flagships'});

  return (
    <Section labelledBy="programme-showcase-title" id="programmes">
      <SectionHeading
        eyebrow={t('eyebrow')}
        title={t('title')}
        headingId="programme-showcase-title"
        variant="split"
        lead={t('intro')}
      />
      <div className="flagship-grid">
        {flagships.map((item) => (
          <article className="programme-card" key={item.id}>
            <h3>{labelFor(item.id, t)}</h3>
            <p>{blurbFor(item.id, t)}</p>
            <FlagshipLinkView href={item.primaryHref} external={item.primaryExternal}>
              {primaryLabelFor(item.id, t)}
            </FlagshipLinkView>
            {item.secondaryHref ? (
              <FlagshipLinkView href={item.secondaryHref} external={false}>
                {secondaryLabelFor(item, t)}
              </FlagshipLinkView>
            ) : null}
          </article>
        ))}
      </div>
    </Section>
  );
}

function FlagshipLinkView({
  href,
  external,
  children,
}: Readonly<{href: string; external: boolean; children: string}>) {
  if (external) {
    return (
      <a href={href} rel="noopener noreferrer" target="_blank">
        {children} <Arrow />
      </a>
    );
  }
  return (
    <Link href={href}>
      {children} <Arrow />
    </Link>
  );
}

type FlagshipTranslator = Awaited<ReturnType<typeof getHomeTranslations>>;

function labelFor(id: FlagshipLink['id'], t: FlagshipTranslator): string {
  switch (id) {
    case 'cpai': return t('items.cpai.label');
    case 'hkict': return t('items.hkict.label');
    case 'tct': return t('items.tct.label');
    case 'asa': return t('items.asa.label');
    case 'insidw': return t('items.insidw.label');
  }
}

function blurbFor(id: FlagshipLink['id'], t: FlagshipTranslator): string {
  switch (id) {
    case 'cpai': return t('items.cpai.blurb');
    case 'hkict': return t('items.hkict.blurb');
    case 'tct': return t('items.tct.blurb');
    case 'asa': return t('items.asa.blurb');
    case 'insidw': return t('items.insidw.blurb');
  }
}

function primaryLabelFor(id: FlagshipLink['id'], t: FlagshipTranslator): string {
  switch (id) {
    case 'cpai': return t('items.cpai.primaryLabel');
    case 'hkict': return t('items.hkict.primaryLabel');
    case 'tct': return t('items.tct.primaryLabel');
    case 'asa': return t('items.asa.primaryLabel');
    case 'insidw': return t('items.insidw.primaryLabel');
  }
}

function secondaryLabelFor(item: FlagshipLink, t: FlagshipTranslator): string {
  if (item.id === 'hkict') return t('items.hkict.secondaryLabel');
  if (item.id === 'tct') return t('items.tct.secondaryLabel');
  return '';
}
