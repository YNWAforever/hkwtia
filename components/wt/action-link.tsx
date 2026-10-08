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

// `prefetch` passes through to the locale-aware Link. Public callers leave it unset and keep
// Next's default; a member-portal caller passes `false`, because prefetching a private route
// costs an authenticated render per visible link (the PrivateLink rule, commit 42930d9a).
type ActionLinkProps = Readonly<{href: string; variant?: ActionLinkVariant; className?: string; prefetch?: boolean; children: ReactNode}>;

export function ActionLink({href, variant = 'button', className, prefetch, children}: ActionLinkProps) {
  // Donor spacing: the literal space between the label and <Arrow /> is the port's own
  // layout, not a stray character for the string audit to flag.
  return (
    <Link className={cn(variantClasses[variant], className)} href={href} {...(prefetch === undefined ? {} : {prefetch})}>
      {children} <Arrow />
    </Link>
  );
}
