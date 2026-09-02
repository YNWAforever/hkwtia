import {cn} from '@/lib/utils';

type CardIndexProps = Readonly<{index: number; className?: string}>;

export function CardIndex({index, className}: CardIndexProps) {
  return <span className={cn('card-index', className)}>{String(index).padStart(2, '0')}</span>;
}
