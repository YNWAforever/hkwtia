import type {Metadata} from 'next';

import {siteConfig} from '@/config/site';
import type {AppLocale} from '@/i18n/routing';
import {absoluteUrl, localizedPath} from '@/lib/urls';

interface BuildPageMetadataInput {
  locale: AppLocale;
  pathname: string;
  title: string;
  description: string;
  image?: string;
}

export function buildPageMetadata({
  locale,
  pathname,
  title,
  description,
  image = siteConfig.defaultImage
}: BuildPageMetadataInput): Metadata {
  const canonical = absoluteUrl(localizedPath(locale, pathname));
  const englishUrl = absoluteUrl(localizedPath('en', pathname));
  const chineseUrl = absoluteUrl(localizedPath('zh-HK', pathname));
  const imageUrl = absoluteUrl(image);

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: {
        en: englishUrl,
        'zh-HK': chineseUrl
      }
    },
    openGraph: {
      type: 'website',
      locale: locale === 'en' ? 'en_HK' : 'zh_HK',
      alternateLocale: locale === 'en' ? ['zh_HK'] : ['en_HK'],
      url: canonical,
      siteName: siteConfig.shortName,
      title,
      description,
      images: [{url: imageUrl}]
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl]
    }
  };
}
