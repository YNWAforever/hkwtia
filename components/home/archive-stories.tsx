import {getTranslations} from 'next-intl/server';
import Image from 'next/image';

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
              {t('galleryAction')} <span aria-hidden="true">↗</span>
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
                  <Image alt={alt} height={606} src={image.src} width={960} />
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
