import Image from 'next/image';

import {assertOwnOriginEditorialImage} from '@/components/marketing/institutional-page-intro';
import {ActionLink, type WtAction} from '@/components/wt/action-link';
import {Eyebrow} from '@/components/wt/eyebrow';
import {Shell} from '@/components/wt/shell';
import {Link} from '@/i18n/navigation';
import {cn} from '@/lib/utils';

type PageHeroProps = Readonly<{
  eyebrow: string;
  title: string;
  lead: string;
  variant?: 'page' | 'inner';
  image?: Readonly<{src: string; alt: string; caption?: string}>;
  artMark?: string;
  actions?: Readonly<{primary: WtAction; secondary?: WtAction}>;
  breadcrumb?: Readonly<{homeHref: string; homeLabel: string; current: string}>;
  id?: string;
  className?: string;
}>;

export function PageHero({eyebrow, title, lead, variant = 'page', image, artMark, actions, breadcrumb, id, className}: PageHeroProps) {
  // CSP is img-src 'self': the figure is own-origin or the render fails, never a remote fetch.
  const imageSrc = image ? assertOwnOriginEditorialImage(image.src) : undefined;

  return (
    <section id={id} className={cn('page-hero', variant === 'inner' && 'inner-page-hero', className)}>
      {image && imageSrc ? (
        <figure className="page-hero-photo">
          <Image src={imageSrc} alt={image.alt} fill sizes="(max-width: 820px) 100vw, 58vw" priority />
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
        {actions ? (
          <div className="inner-hero-actions">
            <ActionLink href={actions.primary.href} tone="button-light">{actions.primary.label}</ActionLink>
            {actions.secondary ? <ActionLink href={actions.secondary.href} tone="text-link-light">{actions.secondary.label}</ActionLink> : null}
          </div>
        ) : null}
        {breadcrumb ? (
          <div className="breadcrumb">
            <Link href={breadcrumb.homeHref}>{breadcrumb.homeLabel}</Link>
            <span aria-hidden="true">/</span>
            <b>{breadcrumb.current}</b>
          </div>
        ) : null}
      </Shell>
    </section>
  );
}
