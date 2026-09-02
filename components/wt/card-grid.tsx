import {Link} from '@/i18n/navigation';
import {cn} from '@/lib/utils';

export type CardGridVariant = 'service' | 'principle' | 'badge';
type Card = Readonly<{title: string; copy: string; href?: string; marker?: string}>;
type CardGridProps = Readonly<{variant: CardGridVariant; items: readonly Card[]; className?: string}>;

export function CardGrid({variant, items, className}: CardGridProps) {
  return (
    <div className={cn(`${variant}-grid`, className)}>
      {items.map((item, index) => {
        const body = (
          <>
            <span>{item.marker ?? String(index + 1).padStart(2, '0')}</span>
            <h3>{item.title}</h3>
            <p>{item.copy}</p>
          </>
        );
        return item.href ? (
          <Link key={item.title} className="service-link" href={item.href}>{body}</Link>
        ) : (
          <article key={item.title}>{body}</article>
        );
      })}
    </div>
  );
}
