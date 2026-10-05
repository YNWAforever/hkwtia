import Image from 'next/image';

import {assertOwnOriginEditorialImage} from '@/components/marketing/institutional-page-intro';
import {ActionLink} from '@/components/wt/action-link';
import {Eyebrow} from '@/components/wt/eyebrow';
import {Shell} from '@/components/wt/shell';
import type {WtAction} from '@/components/wt/types';
import {Link} from '@/i18n/navigation';
import {cn} from '@/lib/utils';

type PageHeroProps = Readonly<{
  eyebrow: string;
  title: string;
  lead: string;
  variant?: 'page' | 'inner';
  image?: Readonly<{src: string; alt: string; caption?: string}>;
  artMark?: string;
  actions?: readonly WtAction[];
  priority?: boolean;
  breadcrumb?: Readonly<{homeHref: string; homeLabel: string; current: string}>;
  /** Accessible name for the breadcrumb `<nav>`. This primitive has no locale of its own, so
   * callers resolve `Common.breadcrumbLabel` themselves and pass the translated string;
   * `BREADCRUMB_LABEL_FALLBACK` only covers a caller that omits it. */
  breadcrumbLabel?: string;
  id?: string;
  className?: string;
}>;

const BREADCRUMB_LABEL_FALLBACK = 'Breadcrumb';

// A page with no photograph used to render the right half of its hero as an empty navy slab
// -- six public pages looked identical above the fold. The signal mark is the design system's
// own motif (WTIA began as the wireless association: transmission arcs, receiving nodes),
// drawn inline so it costs no request and cannot break the `img-src 'self'` CSP. The node
// positions are derived from the title, so each page gets its own constellation while the
// family stays consistent; the same title always draws the same mark, which keeps server and
// client output identical and screenshots comparable.
function signalSeed(text: string) {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 16777619);
  return hash >>> 0;
}

const SIGNAL_ARCS = [120, 200, 280, 360, 440] as const;

// One node on each of the outer four arcs, at an angle inside the visible quarter. A pure
// function of the seed, kept outside the component so render stays free of mutation.
function signalNodes(seed: string) {
  const nodes: {x: number; y: number; r: number}[] = [];
  let state = signalSeed(seed);
  for (const radius of SIGNAL_ARCS.slice(1)) {
    state = Math.imul(state ^ (state >>> 15), 2246822507) >>> 0;
    state = Math.imul(state ^ (state >>> 13), 3266489909) >>> 0;
    const angle = Math.PI * (1.04 + ((state ^ (state >>> 16)) >>> 0) / 4294967296 * 0.42);
    nodes.push({x: 520 + radius * Math.cos(angle), y: 520 + radius * Math.sin(angle), r: radius});
  }
  return nodes;
}

function SignalMark({seed}: {seed: string}) {
  const nodes = signalNodes(seed);

  return (
    <svg className="page-hero-signal" viewBox="0 0 520 520" aria-hidden="true" focusable="false">
      {SIGNAL_ARCS.map((radius) => (
        <path key={radius} className="signal-arc" d={`M ${520 - radius} 520 A ${radius} ${radius} 0 0 1 520 ${520 - radius}`} />
      ))}
      <polyline className="signal-link" points={nodes.map((node) => `${node.x.toFixed(1)},${node.y.toFixed(1)}`).join(' ')} />
      {nodes.map((node) => (
        <circle key={node.r} className="signal-node" cx={node.x.toFixed(1)} cy={node.y.toFixed(1)} r="5" />
      ))}
      <circle className="signal-source" cx="520" cy="520" r="14" />
    </svg>
  );
}

export function PageHero({eyebrow, title, lead, variant = 'page', image, artMark, actions, priority = true, breadcrumb, breadcrumbLabel, id, className}: PageHeroProps) {
  // CSP is img-src 'self': the figure is own-origin or the render fails, never a remote fetch.
  const imageSrc = image ? assertOwnOriginEditorialImage(image.src) : undefined;

  return (
    <section id={id} className={cn('page-hero', variant === 'inner' && 'inner-page-hero', className)}>
      {image && imageSrc ? (
        <figure className="page-hero-photo">
          {/* `.page-hero-photo` sits at `inset: 0 0 0 42%` (the right 58% of the hero) and
              switches to `inset: 0` (full width) under the port's 820px breakpoint. */}
          <Image src={imageSrc} alt={image.alt} fill sizes="(max-width: 820px) 100vw, 58vw" loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined} />
          {image.caption ? <figcaption>{image.caption}</figcaption> : null}
        </figure>
      ) : null}
      {artMark ? (
        <div className="page-hero-art" aria-hidden="true">
          <i />
          <i />
          <i />
          <span>{artMark}</span>
        </div>
      ) : null}
      {!image && !artMark ? <SignalMark seed={title} /> : null}
      <Shell>
        <Eyebrow light>{eyebrow}</Eyebrow>
        <h1>{title}</h1>
        <p>{lead}</p>
        {actions && actions.length > 0 ? (
          <div className="inner-hero-actions">
            {actions.map((action, index) => (
              <ActionLink key={`${index}-${action.href}`} href={action.href} variant={index === 0 ? 'button-light' : 'text-link-light'}>
                {action.label}
              </ActionLink>
            ))}
          </div>
        ) : null}
        {breadcrumb ? (
          <nav className="breadcrumb" aria-label={breadcrumbLabel ?? BREADCRUMB_LABEL_FALLBACK}>
            <Link href={breadcrumb.homeHref}>{breadcrumb.homeLabel}</Link>
            <span aria-hidden="true">/</span>
            <b>{breadcrumb.current}</b>
          </nav>
        ) : null}
      </Shell>
    </section>
  );
}
