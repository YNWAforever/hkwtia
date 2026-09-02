import type {WtStep} from '@/components/wt/types';
import {cn} from '@/lib/utils';

type StepGridProps = Readonly<{steps: readonly WtStep[]; className?: string}>;

export function StepGrid({steps, className}: StepGridProps) {
  return (
    <div className={cn('intro-process', className)}>
      {steps.map((step, index) => (
        <article key={`${index}-${step.title}`}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <h3>{step.title}</h3>
          <p>{step.copy}</p>
        </article>
      ))}
    </div>
  );
}
