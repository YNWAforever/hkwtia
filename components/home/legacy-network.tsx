'use client';

import Image from 'next/image';
import {useState} from 'react';

import {Link} from '@/i18n/navigation';
import type {LegacyNetworkCategory, LegacyNetworkGroup} from '@/lib/home/legacy-network-groups';
import {isPrivateMediaDeliveryUrl} from '@/lib/media/url';

type LegacyNetworkProps = Readonly<{
  groups: readonly LegacyNetworkGroup[];
  labels: Readonly<{
    eyebrow: string;
    title: string;
    note: string;
    viewAllAction: string;
    previewNote: string;
    tabs: Readonly<Record<LegacyNetworkCategory, string>>;
  }>;
}>;

// Section 12 of 13, 'use client': stateful tabs, data passed in from page.tsx. Replaces
// components/marketing/home-partner-wall.tsx. Hidden entirely at 0 published partners --
// never the donor's hard-coded 79. app/styles/wisetech.css:114 .legacy-network;
// :124 .legacy-logo-rail; :125 .legacy-logo-card.
export function LegacyNetwork({groups, labels}: LegacyNetworkProps) {
  const [active, setActive] = useState<LegacyNetworkCategory>('supporting');
  if (groups.every((group) => group.partners.length === 0)) return null;

  const selected = groups.find((group) => group.category === active) ?? groups[0]!;
  const preview = selected.partners.slice(0, 12);
  const previewNote = labels.previewNote
    .replace('{shown}', String(preview.length))
    .replace('{total}', String(selected.partners.length));

  return (
    <section className="legacy-network" aria-labelledby="legacy-network-title">
      <div className="shell">
        <div className="legacy-network-heading">
          <div>
            <p className="eyebrow">{labels.eyebrow}</p>
            <h2 id="legacy-network-title">{labels.title}</h2>
          </div>
          <div className="legacy-network-note">
            <p>{labels.note}</p>
            <Link href="/about">{labels.viewAllAction}</Link>
          </div>
        </div>
        {/* No `role="list"` here: the children are <button> elements, not `listitem`-role
            elements, so a `list` role on this wrapper would mismatch ARIA's expected
            parent/child pairing. `role="group"` plus `aria-pressed` on each button gives
            assistive tech both the titled grouping and the current selection instead
            (matches components/home/ecosystem.tsx's industry-list precedent). */}
        <div className="legacy-tabs" role="group" aria-label={labels.title}>
          {groups.map((group) => (
            <button
              key={group.category}
              type="button"
              className={group.category === active ? 'active' : ''}
              aria-pressed={group.category === active}
              onClick={() => setActive(group.category)}
            >
              <span>{labels.tabs[group.category]}</span>
              <b>{String(group.partners.length).padStart(2, '0')}</b>
            </button>
          ))}
        </div>
        <div className="legacy-logo-rail" aria-live="polite">
          {preview.map((partner) => (
            <article className="legacy-logo-card" key={partner.id}>
              <div className="legacy-logo-image">
                {partner.logoUrl && partner.logoAlt ? (
                  <Image alt={partner.logoAlt} height={202} src={partner.logoUrl} unoptimized={isPrivateMediaDeliveryUrl(partner.logoUrl)} width={320} />
                ) : null}
              </div>
              <h3>{partner.name}</h3>
            </article>
          ))}
        </div>
        <div className="legacy-directory-action">
          <p>{previewNote}</p>
          <Link className="button button-dark" href="/about">{labels.viewAllAction}</Link>
        </div>
      </div>
    </section>
  );
}
