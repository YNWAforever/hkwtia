import type {ReactNode} from 'react';

import {cn} from '@/lib/utils';

type EyebrowProps = Readonly<{children: ReactNode; light?: boolean; className?: string}>;

export function Eyebrow({children, light = false, className}: EyebrowProps) {
  return <p className={cn('eyebrow', light && 'light', className)}>{children}</p>;
}
