import Image from 'next/image';

type PageHeroProps = {eyebrow: string; title: string; description: string; image?: string; imageAlt?: string};

export function PageHero({eyebrow, title, description, image, imageAlt = ''}: PageHeroProps) {
  return (
    <section className="relative overflow-hidden bg-muted/60 py-20 sm:py-28">
      {image ? <Image src={image} alt={imageAlt} fill priority className="object-cover opacity-15" /> : null}
      <div className="container relative mx-auto px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-tight sm:text-6xl">{title}</h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </section>
  );
}
