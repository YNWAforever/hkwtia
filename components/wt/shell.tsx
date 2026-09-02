import type {ReactNode} from 'react';

import {cn} from '@/lib/utils';

type ShellProps = Readonly<{children: ReactNode; className?: string}>;

export function Shell({children, className}: ShellProps) {
  return <div className={cn('shell', className)}>{children}</div>;
}
