import {Arrow} from '@/components/wt/arrow';
import type {WtCard, WtServiceCard} from '@/components/wt/types';
import {Link} from '@/i18n/navigation';
import {cn} from '@/lib/utils';

export type CardGridVariant = 'service' | 'principle' | 'badge';

export type CardGridProps =
  | Readonly<{variant: 'service'; items: readonly WtServiceCard[]; className?: string}>
  | Readonly<{variant: 'principle' | 'badge'; items: readonly WtCard[]; className?: string}>;

export function CardGrid(props: CardGridProps) {
  const {variant, className} = props;

  if (props.variant === 'service') {
    const {items} = props;
    return (
      <div className={cn('service-grid', className)}>
        {items.map((item, index) => {
          const marker = item.marker ?? String(index + 1).padStart(2, '0');
          const body = (
            <>
              <span>{marker}</span>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </>
          );
          return item.href ? (
            // The port's `.service-link>span:last-child` styles the trailing arrow, so it
            // has to be the last span child -- Arrow already renders one.
            <Link key={`${index}-${item.title}`} className="service-link" href={item.href}>
              {body}
              <Arrow />
            </Link>
          ) : (
            <article key={`${index}-${item.title}`}>{body}</article>
          );
        })}
      </div>
    );
  }

  const {items} = props;
  return (
    <div className={cn(`${variant}-grid`, className)}>
      {items.map((item, index) => (
        <article key={`${index}-${item.title}`}>
          {item.marker !== undefined ? (
            <span>{item.marker}</span>
          ) : variant === 'badge' ? (
            // Donor `.badge-grid article>span` renders a 36px disc; this ring is the "no
            // marker supplied" default, so it is decorative rather than a real record.
            <span aria-hidden="true">○</span>
          ) : (
            <span>{String(index + 1).padStart(2, '0')}</span>
          )}
          <h3>{item.title}</h3>
          <p>{item.copy}</p>
        </article>
      ))}
    </div>
  );
}
