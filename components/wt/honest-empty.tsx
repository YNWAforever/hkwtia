import {ActionLink} from '@/components/wt/action-link';
import {StatusLabel} from '@/components/wt/status-label';
import type {WtAction} from '@/components/wt/types';
import {cn} from '@/lib/utils';

export type HonestEmptyVariant = 'ink' | 'light' | 'inner';

const variantClasses: Record<HonestEmptyVariant, string> = {
  ink: 'honest-empty',
  light: 'honest-empty light-empty',
  inner: 'inner-honest',
};

type HonestEmptyBase = Readonly<{
  label?: string;
  title: string;
  copy: string;
  actions?: readonly WtAction[];
  id?: string;
  className?: string;
}>;

// The port only ever styles `.inner-honest h3` (never an h2 in that block), so headingLevel
// isn't a choice that exists on the 'inner' variant -- only the ink/light section blocks take one.
export type HonestEmptyProps =
  | (HonestEmptyBase & Readonly<{variant?: 'ink' | 'light'; headingLevel?: 2 | 3}>)
  | (HonestEmptyBase & Readonly<{variant: 'inner'}>);

// Honest states are a feature (design-fidelity spec §0.3): the region announces itself
// politely and never fabricates records to look full.
export function HonestEmpty(props: HonestEmptyProps) {
  const {label, title, copy, actions, id, className} = props;
  const variant = props.variant ?? 'ink';
  const headingLevel = props.variant === 'inner' ? 3 : props.headingLevel ?? 3;
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  // Donor grammar: the ink block's actions sit in a dedicated flex row (`.open-now-actions`).
  // The light and inner blocks lay bare links straight into their own grid instead --
  // `.inner-honest .button { grid-column: 2 }` targets a direct child, so a wrapper div here
  // would break that layout.
  const [firstVariant, restVariant] = variant === 'ink' ? (['button-light', 'text-link-light'] as const) : (['button', 'text-link'] as const);

  const actionLinks = actions?.map((action, index) => (
    <ActionLink key={`${index}-${action.href}`} href={action.href} variant={index === 0 ? firstVariant : restVariant}>
      {action.label}
    </ActionLink>
  ));

  return (
    <div id={id} className={cn(variantClasses[variant], className)} role="status" aria-live="polite">
      <span className="pulse-ring" aria-hidden="true" />
      <div>
        {/* The donor's light blocks carry no label, and cyan-on-white only reaches 4.37:1. */}
        {label ? <StatusLabel as="p">{label}</StatusLabel> : null}
        <Heading>{title}</Heading>
        <p>{copy}</p>
      </div>
      {actionLinks ? variant === 'ink' ? <div className="open-now-actions">{actionLinks}</div> : actionLinks : null}
    </div>
  );
}
