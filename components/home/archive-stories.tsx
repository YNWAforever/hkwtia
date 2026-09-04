import {getTranslations} from 'next-intl/server';
import Image from 'next/image';

import {Arrow} from '@/components/wt/arrow';
import {milestones} from '@/content/milestones';
import {Link} from '@/i18n/navigation';
import type {AppLocale} from '@/i18n/routing';
import {featuredOnly} from '@/lib/history/milestones';

// Section 11 of 13 (D-9). Top 4 featured milestones with at least one image; hidden
// entirely below that. app/styles/wisetech.css:517 .archive-proof; :521 .archive-photo-grid;
// :522 .archive-photo-card; :530 .archive-photo-feature (first card, wide).
export async function ArchiveStories({locale}: Readonly<{locale: AppLocale}>) {
  const t = await getTranslations({locale, namespace: 'Home.archiveStories'});
  const useChinese = locale === 'zh-HK';
  const stories = featuredOnly(milestones)
    .filter((milestone) => milestone.images.length > 0)
    .slice(0, 4);

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
        <div className="archive-photo-grid">
          {stories.map((story, index) => {
            const image = story.images[0]!;
            const title = useChinese ? story.titleZh : story.titleEn;
            const body = useChinese ? story.bodyZh : story.bodyEn;
            const alt = useChinese ? image.altZh : image.altEn;
            return (
              <figure className={index === 0 ? 'archive-photo-card archive-photo-feature' : 'archive-photo-card'} key={story.slug}>
                <div className="archive-photo-media">
                  {/* .archive-photo-feature splits 1.42fr/.58fr (image/caption) above the 1120px
                      breakpoint, where it collapses to a single stacked column (image full width);
                      the other cards sit in the 2-column .archive-photo-grid until it collapses to
                      1 column at 820px (wisetech.css:521,530,573,583). */}
                  <Image
                    alt={alt}
                    height={606}
                    sizes={index === 0 ? '(min-width: 1121px) 71vw, 100vw' : '(min-width: 821px) 50vw, 100vw'}
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
