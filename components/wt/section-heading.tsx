import {Eyebrow} from '@/components/wt/eyebrow';
import {cn} from '@/lib/utils';

type SectionHeadingCommon = Readonly<{
  eyebrow: string;
  title: string;
  // Lands on the <h2>, not the root: it pairs with Section's `labelledBy`, unlike every
  // other primitive's root-level `id`.
  headingId?: string;
  inverse?: boolean;
  className?: string;
}>;

// The port has no `.section-heading>p` rule and the donor never pairs a lead with the
// stacked grammar, so 'stacked' carries no `lead` at all.
export type SectionHeadingProps =
  | (SectionHeadingCommon & Readonly<{variant?: 'stacked'}>)
  | (SectionHeadingCommon & Readonly<{variant: 'split' | 'inner'; lead?: string}>);

export function SectionHeading(props: SectionHeadingProps) {
  const {eyebrow, title, headingId, inverse = false, className} = props;

  if (props.variant === 'inner') {
    const {lead} = props;
    return (
      <div className={cn('inner-section-heading', className)}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 id={headingId}>{title}</h2>
        {lead ? <p>{lead}</p> : null}
      </div>
    );
  }

  const heading = (
    <>
      <Eyebrow light={inverse}>{eyebrow}</Eyebrow>
      <h2 id={headingId}>{title}</h2>
    </>
  );

  if (props.variant === 'split') {
    const {lead} = props;
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
    </div>
  );
}
