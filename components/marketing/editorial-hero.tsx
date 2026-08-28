import Image from "next/image";

import {Link} from "@/i18n/navigation";

export type EditorialHeroProps = Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  actions: readonly [
    Readonly<{label: string; href: "/events"}>,
    Readonly<{label: string; href: "/membership"}>,
  ];
  discoverLabel: string;
}>;

const controlClass = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-5 py-3 text-center font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950";

export function EditorialHero({eyebrow, title, description, image, imageAlt, actions, discoverLabel}: EditorialHeroProps) {
  return (
    <section className="relative isolate min-h-[34rem] overflow-hidden bg-slate-950 text-white">
      <Image alt={imageAlt} className="object-cover" fill priority sizes="100vw" src={image} />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/85 to-slate-950/35" />
      <div className="container relative mx-auto flex min-h-[34rem] items-end px-6 py-16 sm:items-center sm:py-24">
        <div className="max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-200">{eyebrow}</p>
          <h1 className="mt-4 font-serif text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">{title}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-100 sm:text-xl">{description}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link className={`${controlClass} bg-white text-slate-950 hover:bg-slate-100`} href={actions[0].href}>{actions[0].label}</Link>
            <Link className={`${controlClass} border border-white/70 bg-slate-950/35 text-white hover:bg-white/10`} href={actions[1].href}>{actions[1].label}</Link>
            <a className={`${controlClass} text-white underline decoration-white/60 underline-offset-4 hover:decoration-white`} href="#home-discover">{discoverLabel}</a>
          </div>
        </div>
      </div>
    </section>
  );
}
