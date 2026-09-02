import type {ReactNode} from 'react';

import {Arrow} from '@/components/wt/arrow';
import {Link} from '@/i18n/navigation';
import {cn} from '@/lib/utils';

export type ActionLinkTone = 'button' | 'button-dark' | 'button-light' | 'text-link' | 'text-link-light';

const toneClasses: Record<ActionLinkTone, string> = {
  button: 'button',
  'button-dark': 'button button-dark',
  'button-light': 'button button-light',
  'text-link': 'text-link',
  'text-link-light': 'text-link light-link',
};

export type WtAction = Readonly<{href: string; label: string}>;

type ActionLinkProps = Readonly<{href: string; tone?: ActionLinkTone; className?: string; children: ReactNode}>;

export function ActionLink({href, tone = 'button', className, children}: ActionLinkProps) {
  return (
    <Link className={cn(toneClasses[tone], className)} href={href}>
      {children} <Arrow />
    </Link>
  );
}
