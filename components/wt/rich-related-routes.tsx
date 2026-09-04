import {Arrow} from '@/components/wt/arrow';
import {Link} from '@/i18n/navigation';
import {cn} from '@/lib/utils';

export type RichRelatedRouteItem = Readonly<{href: string; label: string; title: string; description: string}>;

type RichRelatedRoutesProps = Readonly<{items: readonly RichRelatedRouteItem[]; className?: string}>;

// app/styles/wisetech.css:951 .rich-related-grid (3 columns); :952-957 the card grammar --
// label span first, h3/p in the middle, a trailing span last -- so the CSS's
// `>a>span:first-child` / `>a>span:last-child` selectors both resolve. Arrow already renders
// an aria-hidden <span>, so it is the correct trailing element without a bespoke one here.
export function RichRelatedRoutes({items, className}: RichRelatedRoutesProps) {
  return (
    <div className={cn('rich-related-grid', className)}>
      {items.map((item) => (
        <Link key={item.href} href={item.href}>
          <span>{item.label}</span>
          <h3>{item.title}</h3>
          <p>{item.description}</p>
          <Arrow />
        </Link>
      ))}
    </div>
  );
}
