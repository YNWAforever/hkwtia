import type {ReactNode} from 'react';

import {cn} from '@/lib/utils';

type StatusLabelProps = Readonly<{children: ReactNode; as?: 'span' | 'p'; className?: string}>;

export function StatusLabel({children, as: Tag = 'span', className}: StatusLabelProps) {
  return <Tag className={cn('status-label', className)}>{children}</Tag>;
}
