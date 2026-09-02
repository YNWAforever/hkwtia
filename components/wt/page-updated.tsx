import {Shell} from '@/components/wt/shell';
import {cn} from '@/lib/utils';

type PageUpdatedProps = Readonly<{label: string; dateTime: string; formattedDate: string; note?: string; className?: string}>;

// The date is a typed record or page-copy value chosen by the page, never Date.now()
// (design-fidelity spec §4.2), so a build is reproducible.
export function PageUpdated({label, dateTime, formattedDate, note, className}: PageUpdatedProps) {
  return (
    <section className={cn('page-updated', className)}>
      <Shell>
        <span>{label}</span>
        <p>
          <time dateTime={dateTime}>{formattedDate}</time>
          {note ? <> {note}</> : null}
        </p>
      </Shell>
    </section>
  );
}
