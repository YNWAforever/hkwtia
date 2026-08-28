import type {ReactNode} from "react";

export type StorySectionProps = Readonly<{
  heading: string;
  intro?: string;
  children: ReactNode;
  tone: "plain" | "warm";
}>;

const toneClass = {
  plain: "bg-background",
  warm: "bg-shell-warm",
} as const satisfies Record<StorySectionProps["tone"], string>;

export function StorySection({heading, intro, children, tone}: StorySectionProps) {
  return (
    <section className={`${toneClass[tone]} py-16 sm:py-24`}>
      <div className="container mx-auto px-6">
        <h2 className="editorial-serif text-3xl font-semibold text-shell-ink sm:text-4xl">{heading}</h2>
        {intro ? <p className="mt-4 max-w-3xl text-lg leading-relaxed text-muted-foreground">{intro}</p> : null}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}
