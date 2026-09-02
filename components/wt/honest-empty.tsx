import type {ReactNode} from 'react';

import {StatusLabel} from '@/components/wt/status-label';
import {cn} from '@/lib/utils';

export type HonestEmptyTone = 'ink' | 'light' | 'inner';

const toneClasses: Record<HonestEmptyTone, string> = {
  ink: 'honest-empty',
  light: 'honest-empty light-empty',
  inner: 'inner-honest',
};

type HonestEmptyProps = Readonly<{
  label: string;
  title: string;
  copy: string;
  tone?: HonestEmptyTone;
  actions?: ReactNode;
  headingLevel?: 2 | 3;
  id?: string;
  className?: string;
}>;

// Honest states are a feature (design-fidelity spec §0.3): the region announces itself
// politely and never fabricates records to look full.
export function HonestEmpty({label, title, copy, tone = 'ink', actions, headingLevel = 3, id, className}: HonestEmptyProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div id={id} className={cn(toneClasses[tone], className)} role="status" aria-live="polite">
      <span className="pulse-ring" aria-hidden="true" />
      <div>
        <StatusLabel as="p">{label}</StatusLabel>
        <Heading>{title}</Heading>
        <p>{copy}</p>
      </div>
      {actions ? <div className="open-now-actions">{actions}</div> : null}
    </div>
  );
}
