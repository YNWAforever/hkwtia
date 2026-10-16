import {getHomeTranslations, type HomeCopyProps} from '@/lib/home/copy-preview';
import Image from 'next/image';
import type {ReactNode} from 'react';

import {Arrow} from '@/components/wt/arrow';
import {milestones} from '@/content/milestones';
import {Link} from '@/i18n/navigation';
import {featuredOnly} from '@/lib/history/milestones';
import {readableMilestoneBody} from '@/lib/history/readable-body';
import {cn} from '@/lib/utils';

/** D-9: the top 4 featured milestones with at least one image. */
export function homeArchiveStories() {
  return featuredOnly(milestones)
    .filter((milestone) => milestone.images.length > 0)
    .slice(0, 4);
}

// D-9: hidden entirely when no featured milestone has an image. app/styles/wisetech.css:517
// .archive-proof; :521 .archive-photo-grid; :522 .archive-photo-card; :530 .archive-photo-feature
// (first card, wide). `children` (the homepage since the 2026-10-06 consolidation) is the
// ImpactEvidence strip, placed between the heading and the photographs it substantiates.
export async function ArchiveStories({locale, copyOverrides, children}: HomeCopyProps & {children?: ReactNode}) {
  const t = await getHomeTranslations({locale, copyOverrides, namespace: 'Home.archiveStories'});
  const useChinese = locale === 'zh-HK';
  const stories = homeArchiveStories();

  if (stories.length === 0) return null;

  return (
    <section className="archive-proof" aria-labelledby="archive-stories-title">
      <div className="shell">
        <div className="archive-proof-heading">
          <div>
            <p className="eyebrow">{t('eyebrow')}</p>
            <h2 id="archive-stories-title">{t('title')}</h2>
          </div>
          <div>
            <p>{t('intro')}</p>
            <a className="text-link" href="https://hkwtia.org/photo-gallery/" target="_blank" rel="noreferrer">
              {t('galleryAction')} <Arrow />
            </a>
          </div>
        </div>
        {children}
        <div className="archive-photo-grid">
          {stories.map((story, index) => {
            const image = story.images[0]!;
            const title = useChinese ? story.titleZh : story.titleEn;
            // Lead paragraph only. Bodies are multi-paragraph records separated by
            // '\n\n' (app/[locale]/(public)/about/history/[slug] splits on the same
            // token and uses [0] as its hero lead); dropping the whole body into one
            // <p> collapsed every break to a space and rendered the card as a single
            // run-on block.
            const body = readableMilestoneBody(useChinese ? story.bodyZh : story.bodyEn)[0] ?? '';
            const alt = useChinese ? image.altZh : image.altEn;
            // After the full-width lead, the rest pair up two per row. With an even count the
            // last card had no partner and sat alone at half width beside an empty column, so
            // it closes the grid as a second, mirrored feature instead.
            const closing = index > 0 && index === stories.length - 1 && stories.length % 2 === 0;
            const wide = index === 0 || closing;
            return (
              <figure className={cn('archive-photo-card', wide && 'archive-photo-feature', closing && 'archive-photo-feature-reverse')} key={story.slug}>
                <div className="archive-photo-media">
                  {/* .archive-photo-feature splits 1.42fr/.58fr (image/caption) above the 1120px
                      breakpoint, where it collapses to a single stacked column (image full width);
                      the other cards sit in the 2-column .archive-photo-grid until it collapses to
                      1 column at 820px (wisetech.css:521,530,573,583). */}
                  <Image
                    alt={alt}
                    height={606}
                    sizes={wide ? '(min-width: 1121px) 71vw, 100vw' : '(min-width: 821px) 50vw, 100vw'}
                    src={image.src}
                    width={960}
                  />
                </div>
                <figcaption>
                  <span>{t('captionLabel')}</span>
                  <Link href={`/about/history/${story.slug}`}><h3>{title}</h3></Link>
                  <p>{body}</p>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>
    </section>
  );
}
