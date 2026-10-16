import type {ReactNode} from 'react';

import {Shell} from '@/components/wt/shell';
import {cn} from '@/lib/utils';

export type SectionTone = 'paper' | 'bright' | 'ink';

// Donor grammar: `.section` on paper, `.inner-section-tint` for the pale blue band,
// `.opportunity-section` for the ink band whose headings invert (design-fidelity spec §4.2).
const toneClasses: Record<SectionTone, string> = {
  paper: 'section',
  bright: 'section inner-section inner-section-tint',
  ink: 'section opportunity-section',
};

type SectionProps = Readonly<{
  children: ReactNode;
  tone?: SectionTone;
  id?: string;
  labelledBy?: string;
  className?: string;
  shellClassName?: string;
}>;

export function Section({children, tone = 'paper', id, labelledBy, className, shellClassName}: SectionProps) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn(toneClasses[tone], className)}>
      <Shell className={shellClassName}>{children}</Shell>
    </section>
  );
}
