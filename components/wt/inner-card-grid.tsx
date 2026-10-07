import {Arrow} from '@/components/wt/arrow';
import {Link} from '@/i18n/navigation';

export type InnerCardGridItem = Readonly<{href: string; title: string; copy: string}>;

// `prefetch` as on ActionLink: unset for public callers, `false` from the member portal.
export function InnerCardGrid({items, actionLabel, prefetch}: Readonly<{items: readonly InnerCardGridItem[]; actionLabel: string; prefetch?: boolean}>) {
  return (
    <div className="inner-card-grid">
      {items.map((item, index) => (
        <Link key={item.href} className="inner-card" href={item.href} {...(prefetch === undefined ? {} : {prefetch})}>
          <span className="inner-card-index">{String(index + 1).padStart(2, '0')}</span>
          <h3>{item.title}</h3>
          <p>{item.copy}</p>
          <b><span>{actionLabel}</span><Arrow /></b>
        </Link>
      ))}
    </div>
  );
}
