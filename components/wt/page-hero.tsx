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

export function PageHero({eyebrow, title, lead, variant = 'page', image, artMark, actions, priority = true, breadcrumb, breadcrumbLabel, id, className}: PageHeroProps) {
  // CSP is img-src 'self': the figure is own-origin or the render fails, never a remote fetch.
  const imageSrc = image ? assertOwnOriginEditorialImage(image.src) : undefined;

  return (
    <section id={id} className={cn('page-hero', variant === 'inner' && 'inner-page-hero', className)}>
      {image && imageSrc ? (
        <figure className="page-hero-photo">
          {/* `.page-hero-photo` sits at `inset: 0 0 0 42%` (the right 58% of the hero) and
              switches to `inset: 0` (full width) under the port's 820px breakpoint. */}
          <Image src={imageSrc} alt={image.alt} fill sizes="(max-width: 820px) 100vw, 58vw" priority={priority} />
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
