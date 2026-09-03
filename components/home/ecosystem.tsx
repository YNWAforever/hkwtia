'use client';

import {useState} from 'react';

import {ActionLink} from '@/components/wt/action-link';
import {Arrow} from '@/components/wt/arrow';
import {Section} from '@/components/wt/section';
import {SectionHeading} from '@/components/wt/section-heading';
import type {EcosystemIndustryView} from '@/lib/home/ecosystem-industries';

type EcosystemProps = Readonly<{
  industries: readonly EcosystemIndustryView[];
  labels: Readonly<{
    eyebrow: string;
    title: string;
    intro: string;
    selectedLabel: string;
    enterAction: string;
    focusAreas: readonly string[];
  }>;
}>;

// Section 7 of 13, and the first 'use client' homepage section: a stateful industry selector
// over data resolved on the server (Task 15) by lib/home/ecosystem-industries.ts and passed in
// as props, because a function cannot cross the server/client boundary as a prop.
// app/styles/wisetech.css:164 .ecosystem-board; :165 .industry-list; :166 .industry-button;
// :171 .industry-focus.
export function Ecosystem({industries, labels}: EcosystemProps) {
  const [selectedKey, setSelectedKey] = useState(industries[0]!.key);
  const current = industries.find((industry) => industry.key === selectedKey) ?? industries[0]!;

  return (
    <Section labelledBy="ecosystem-title" id="ecosystem">
      <SectionHeading eyebrow={labels.eyebrow} title={labels.title} headingId="ecosystem-title" variant="split" lead={labels.intro} />
      <div className="ecosystem-board">
        {/* No `role="list"` here: the children are <button> elements, not `listitem`-role
            elements, so a `list` role on this wrapper would mismatch ARIA's expected
            parent/child pairing. `role="group"` plus `aria-pressed` on each button gives
            assistive tech both the titled grouping and the current selection instead. */}
        <div className="industry-list" role="group" aria-label={labels.eyebrow}>
          {industries.map((industry) => (
            <button
              key={industry.key}
              type="button"
              aria-pressed={industry.key === selectedKey}
              className={industry.key === selectedKey ? 'industry-button active' : 'industry-button'}
              onClick={() => setSelectedKey(industry.key)}
            >
              <span>{industry.signal}</span>
              <b>{industry.name}</b>
              <Arrow />
            </button>
          ))}
        </div>
        <div className="industry-focus" aria-live="polite">
          <p className="eyebrow">{labels.selectedLabel}</p>
          <h3>{current.name}</h3>
          <p>{current.brief}</p>
          <ul>
            {labels.focusAreas.map((area) => <li key={area}>{area}</li>)}
          </ul>
          <ActionLink href={current.href} variant="text-link">{labels.enterAction}</ActionLink>
        </div>
      </div>
    </Section>
  );
}
