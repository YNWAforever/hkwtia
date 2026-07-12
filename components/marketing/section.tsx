import type {ReactNode} from 'react';

export function Section({heading, intro, children}: {heading: string; intro?: string; children: ReactNode}) {
  return (
    <section className="py-16 sm:py-24">
      <div className="container mx-auto px-6">
        <h2 className="text-3xl font-semibold sm:text-4xl">{heading}</h2>
        {intro ? <p className="mt-4 max-w-3xl leading-relaxed text-muted-foreground">{intro}</p> : null}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}
