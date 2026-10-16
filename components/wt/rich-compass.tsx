import {Shell} from '@/components/wt/shell';
import {Link} from '@/i18n/navigation';
import {cn} from '@/lib/utils';

export type RichCompassItem = Readonly<{label: string; value: string; href?: string}>;

type RichCompassProps = Readonly<{items: readonly RichCompassItem[]; className?: string}>;

// app/styles/wisetech.css:896 .rich-compass; :897 .rich-compass-grid (a fixed 3 columns);
// :898-899 border rules keyed to `.rich-compass-grid>div` only -- there is no `>a` rule here,
// unlike .rich-items-cards>a. Every cell therefore stays a <div> so the CSS's border/padding
// apply either way; only the value becomes a real Link when the caller supplies an href.
// Reusable across pages: this file carries no page's own links or stats, only the grid shell.
export function RichCompass({items, className}: RichCompassProps) {
  return (
    <div className={cn('rich-compass', className)}>
      <Shell>
        <div className="rich-compass-grid">
          {items.map((item, index) => (
            <div key={`${index}-${item.label}`}>
              <span>{item.label}</span>
              {item.href ? (
                <Link href={item.href}>
                  <strong>{item.value}</strong>
                </Link>
              ) : (
                <strong>{item.value}</strong>
              )}
            </div>
          ))}
        </div>
      </Shell>
    </div>
  );
}
