import Image from "next/image";
import type {ReactNode} from "react";

import {Link} from "@/i18n/navigation";

export type AuthShellLink = Readonly<{label: string; href: string; external?: boolean}>;

type AuthShellProps = Readonly<{
  brand: Readonly<{homeLabel: string; logoAlt: string; name: string}>;
  navigationLabel: string;
  links: readonly AuthShellLink[];
  localeSwitcher: ReactNode;
  explainer: Readonly<{eyebrow: string; title: string; steps: readonly string[]}>;
  children: ReactNode;
}>;

const SIGNAL_ARCS = [90, 160, 230, 300, 370] as const;

/**
 * The frame both sign-in pages share. Sign-in used to be a bare card under a header whose four
 * links wrapped onto three lines on a phone, with nothing on the page explaining that there is
 * no password: a first-time member had to trust an email they had not yet received. The
 * explainer states only what the code guarantees -- the link is emailed, and the continuation
 * (`next`) brings the reader back to the page they asked for.
 *
 * Auth pages render outside the public route group, so this uses Tailwind and the shared
 * tokens rather than the donor stylesheet. On a phone the form comes first; the explainer and
 * the helpful links follow it.
 */
export function AuthShell({brand, navigationLabel, links, localeSwitcher, explainer, children}: AuthShellProps) {
  return (
    <main className="flex min-h-screen flex-col bg-background lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
      <div className="flex flex-col px-4 py-5 sm:px-8 sm:py-8 lg:min-h-screen lg:px-14">
        <header className="flex items-center justify-between gap-4">
          <Link aria-label={brand.homeLabel} className="inline-flex min-h-11 items-center gap-3" href="/">
            <Image alt={brand.logoAlt} height={36} src="/images/wtia-logo.png" width={100} />
            <span className="hidden text-base font-semibold text-primary sm:inline">{brand.name}</span>
          </Link>
          {localeSwitcher}
        </header>
        <div className="flex flex-1 flex-col justify-center py-8 sm:py-12">
          <div className="mx-auto w-full max-w-md">{children}</div>
        </div>
        <nav aria-label={navigationLabel} className="mx-auto flex w-full max-w-md flex-wrap gap-x-6 border-t border-border pt-3 text-sm">
          {links.map((link) => link.external
            ? <a className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline" href={link.href} key={link.href}>{link.label}</a>
            : <Link className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline" href={link.href} key={link.href}>{link.label}</Link>)}
        </nav>
      </div>
      <aside
        aria-labelledby="auth-explainer-title"
        className="relative overflow-hidden bg-shell-navy px-6 py-10 text-white sm:px-10 lg:flex lg:min-h-screen lg:flex-col lg:justify-center lg:px-14"
      >
        <svg aria-hidden="true" className="pointer-events-none absolute -bottom-8 -right-8 h-[380px] w-[380px] opacity-70 lg:h-[520px] lg:w-[520px]" focusable="false" viewBox="0 0 420 420">
          {SIGNAL_ARCS.map((radius, index) => (
            <path d={`M ${420 - radius} 420 A ${radius} ${radius} 0 0 1 420 ${420 - radius}`} fill="none" key={radius} stroke="rgba(143,196,224,0.32)" strokeDasharray={index % 2 === 0 ? "2 7" : undefined} strokeWidth="1.2" />
          ))}
          <circle cx="420" cy="420" fill="#1a80b6" r="12" />
        </svg>
        <div className="relative max-w-md">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#8fc4e0]">{explainer.eyebrow}</p>
          <h2 className="editorial-serif mt-4 text-3xl leading-tight sm:text-4xl" id="auth-explainer-title">{explainer.title}</h2>
          <ol className="mt-8 grid gap-5">
            {explainer.steps.map((step, index) => (
              <li className="grid grid-cols-[36px_1fr] items-baseline gap-3" key={step}>
                <span aria-hidden="true" className="grid size-8 place-items-center rounded-full border border-[#8fc4e0]/60 text-xs font-bold text-[#8fc4e0]">{index + 1}</span>
                <span className="text-[15px] leading-relaxed text-white/85">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </main>
  );
}
