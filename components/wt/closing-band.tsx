import {ActionLink} from '@/components/wt/action-link';
import {Eyebrow} from '@/components/wt/eyebrow';
import {Shell} from '@/components/wt/shell';
import type {WtAction} from '@/components/wt/types';
import {cn} from '@/lib/utils';

type ClosingBandProps = Readonly<{eyebrow: string; title: string; copy: string; actions: readonly WtAction[]; id?: string; className?: string}>;

export function ClosingBand({eyebrow, title, copy, actions, id, className}: ClosingBandProps) {
  return (
    <section id={id} className={cn('inner-closing', className)}>
      <Shell className="inner-closing-grid">
        <div>
          <Eyebrow light>{eyebrow}</Eyebrow>
          <h2>{title}</h2>
          <p>{copy}</p>
        </div>
        <div className="inner-closing-actions">
          {actions.map((action, index) => (
            <ActionLink key={`${index}-${action.href}`} href={action.href} variant={index === 0 ? 'button-light' : 'text-link-light'}>
              {action.label}
            </ActionLink>
          ))}
        </div>
      </Shell>
    </section>
  );
}
