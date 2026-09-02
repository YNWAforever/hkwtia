import type {ReactNode} from 'react';

import {Arrow} from '@/components/wt/arrow';
import {Link} from '@/i18n/navigation';
import {cn} from '@/lib/utils';

export type ActionLinkVariant = 'button' | 'button-dark' | 'button-light' | 'text-link' | 'text-link-light';

const variantClasses: Record<ActionLinkVariant, string> = {
  button: 'button',
  'button-dark': 'button button-dark',
  'button-light': 'button button-light',
  'text-link': 'text-link',
  'text-link-light': 'text-link light-link',
};

type ActionLinkProps = Readonly<{href: string; variant?: ActionLinkVariant; className?: string; children: ReactNode}>;

export function ActionLink({href, variant = 'button', className, children}: ActionLinkProps) {
  // Donor spacing: the literal space between the label and <Arrow /> is the port's own
  // layout, not a stray character for the string audit to flag.
  return (
    <Link className={cn(variantClasses[variant], className)} href={href}>
      {children} <Arrow />
    </Link>
  );
}
