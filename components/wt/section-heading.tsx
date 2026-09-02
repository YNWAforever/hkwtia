import {Eyebrow} from '@/components/wt/eyebrow';
import {cn} from '@/lib/utils';

type SectionHeadingProps = Readonly<{
  eyebrow: string;
  title: string;
  lead?: string;
  id?: string;
  layout?: 'stacked' | 'split' | 'inner';
  inverse?: boolean;
  className?: string;
}>;

export function SectionHeading({eyebrow, title, lead, id, layout = 'stacked', inverse = false, className}: SectionHeadingProps) {
  if (layout === 'inner') {
    return (
      <div className={cn('inner-section-heading', className)}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 id={id}>{title}</h2>
        {lead ? <p>{lead}</p> : null}
      </div>
    );
  }

  const heading = (
    <>
      <Eyebrow light={inverse}>{eyebrow}</Eyebrow>
      <h2 id={id}>{title}</h2>
    </>
  );

  if (layout === 'split') {
    return (
      <div className={cn('section-heading split-heading', inverse && 'inverse', className)}>
        <div>{heading}</div>
        {lead ? <p>{lead}</p> : null}
      </div>
    );
  }

  return (
    <div className={cn('section-heading', inverse && 'inverse', className)}>
      {heading}
      {lead ? <p>{lead}</p> : null}
    </div>
  );
}
