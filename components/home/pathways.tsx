import {getHomeTranslations, type HomeCopyProps} from '@/lib/home/copy-preview';

import {Arrow} from '@/components/wt/arrow';
import {SectionHeading} from '@/components/wt/section-heading';
import {Section} from '@/components/wt/section';
import {Link} from '@/i18n/navigation';

// D-7: SME is an audience pathway, not a fifth plan. Hrefs are hkwtia's canonical
// destinations (master table row 3), not the donor's unported routes.
// corporates and professionals intentionally share /membership (D-7): both are membership
// pathways on the same catalog page, not separate destinations.
const items = [
  {key: 'corporates', href: '/membership', accent: 'cyan', destinations: ['membership', 'showcase', 'partners']},
  {key: 'smes', href: '/events', accent: 'jade', destinations: ['events', 'showcase', 'membership']},
  {key: 'startups', href: '/showcase', accent: 'amber', destinations: ['showcase', 'launchpad', 'programmes']},
  {key: 'professionals', href: '/membership', accent: 'blue', destinations: ['membership', 'cpai', 'committees']},
  {key: 'gba', href: '/launchpad', accent: 'violet', destinations: ['launchpad', 'partners', 'events']},
] as const;

// Every destination is a live public route; the route finder never points at a page that
// does not exist, so a staff edit to the copy cannot create a dead end.
const destinationHrefs = {
  membership: '/membership',
  showcase: '/showcase',
  events: '/events',
  launchpad: '/launchpad',
  partners: '/partners',
  programmes: '/programmes',
  cpai: '/programs/cpai',
  committees: '/about/committees',
} as const;

// Section 3 of 13: the route finder, the homepage's signature interaction.
//
// Five identical audience cards answered "who is this for" but not "what do I do next", so
// the section now draws the route: pick who you are and the signal fans out to the three
// pages that serve you. It is deliberately built from native radio inputs and CSS `:has()`
// (app/styles/wisetech-experience.css) rather than a client island -- the homepage is the
// one route whose Lighthouse TBT already sits at the 0.90 gate (docs/audits/
// hkwtia-2026-10-03-full-fix/evidence/t15), so this interaction ships zero JavaScript.
// Arrow keys move between audiences because that is what a radio group does natively.
// A browser without `:has()` shows all five routes stacked, which is still complete.
export async function Pathways({locale, copyOverrides}: HomeCopyProps) {
  const t = await getHomeTranslations({locale, copyOverrides, namespace: 'Home.pathways'});

  return (
    <Section labelledBy="pathways-title" id="pathways" className="route-section">
      <SectionHeading eyebrow={t('eyebrow')} title={t('title')} headingId="pathways-title" variant="split" lead={t('intro')} />
      <div className="route-finder">
        <fieldset className="route-picker">
          <legend className="route-legend">{t('legend')}</legend>
          {items.map((item, index) => (
            <div key={item.key} className={`route-choice accent-${item.accent}`}>
              <input
                className="route-input"
                type="radio"
                name="home-route"
                id={`route-${item.key}`}
                value={item.key}
                defaultChecked={index === 0}
                aria-describedby={`route-${item.key}-copy`}
              />
              <label className="route-option" htmlFor={`route-${item.key}`}>
                <span className="route-option-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <span className="route-option-title">{t(`items.${item.key}.title`)}</span>
                <span className="route-option-copy" id={`route-${item.key}-copy`}>{t(`items.${item.key}.copy`)}</span>
              </label>
            </div>
          ))}
        </fieldset>
        <div className="route-panels">
          {items.map((item) => (
            <article
              key={item.key}
              className={`route-panel accent-${item.accent}`}
              data-route={item.key}
              aria-labelledby={`route-${item.key}-panel-title`}
            >
              <div className="route-origin">
                <span className="route-signal" aria-hidden="true"><i /><i /><i /></span>
                <p className="route-eyebrow">{t('routeEyebrow')}</p>
                <h3 id={`route-${item.key}-panel-title`}>{t(`items.${item.key}.title`)}</h3>
                <p className="route-benefits">{t(`items.${item.key}.benefits`)}</p>
                <Link className="route-primary" href={item.href}>
                  <span>{t('primaryLabel')}</span>
                  {t(`items.${item.key}.cta`)} <Arrow />
                </Link>
              </div>
              <div className="route-destinations">
                <p className="route-lead">{t('routeLead')}</p>
                <ol>
                  {item.destinations.map((destination) => (
                    <li key={destination}>
                      <Link className="route-destination" href={destinationHrefs[destination]}>
                        <span className="route-node" aria-hidden="true" />
                        <strong>{t(`destinations.${destination}.label`)}</strong>
                        <span>{t(`destinations.${destination}.copy`)}</span>
                        <Arrow />
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>
            </article>
          ))}
        </div>
      </div>
    </Section>
  );
}
