import type {ReactNode} from 'react';

import {Eyebrow} from '@/components/wt/eyebrow';
import {Shell} from '@/components/wt/shell';
import {cn} from '@/lib/utils';

type InterestBandProps = Readonly<{eyebrow: string; title: string; copy: string; action: ReactNode; id?: string; className?: string}>;

// D-6: the action slot takes a prepared mailto link or a Concierge launcher; nothing here persists.
export function InterestBand({eyebrow, title, copy, action, id, className}: InterestBandProps) {
  return (
    <section id={id} className={cn('event-interest', className)}>
      <Shell className="event-interest-grid">
        <div>
          <Eyebrow light>{eyebrow}</Eyebrow>
          <h2>{title}</h2>
          <p>{copy}</p>
        </div>
        {action}
      </Shell>
    </section>
  );
}
