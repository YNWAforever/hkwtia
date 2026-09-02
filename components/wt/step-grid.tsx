import {cn} from '@/lib/utils';

type Step = Readonly<{title: string; copy: string}>;
type StepGridProps = Readonly<{steps: readonly Step[]; className?: string}>;

export function StepGrid({steps, className}: StepGridProps) {
  return (
    <div className={cn('intro-process', className)}>
      {steps.map((step, index) => (
        <article key={step.title}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <h3>{step.title}</h3>
          <p>{step.copy}</p>
        </article>
      ))}
    </div>
  );
}
