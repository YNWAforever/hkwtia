import type {Metadata} from 'next';

import {siteConfig} from '@/config/site';
import type {AppLocale} from '@/i18n/routing';
import {ogImagePath} from '@/lib/og/resolve-renderer';
import {absoluteUrl, localizedPath} from '@/lib/urls';

interface BuildPageMetadataInput {
  locale: AppLocale;
  pathname: string;
  title: string;
  description: string;
  image?: string;
  /** Set false for token-bearing or mid-flow pages that must stay out of search. */
  index?: boolean;
}

// D-1: every public <title> is "<page> | WiseTech Hong Kong" (fullwidth bar, no spaces, in zh-HK).
// Pages whose title is a record name (events, news, showcase, history) or a lowercase-namespace
// programme title cannot carry the suffix in the message bundle, so they brand here. Exhaustive
// over AppLocale so adding a locale fails typecheck rather than silently falling into one branch.
const brandTitle: Record<AppLocale, (title: string) => string> = {
  en: (title) => `${title} | ${siteConfig.publicBrand}`,
  'zh-HK': (title) => `${title}｜${siteConfig.publicBrand}`
};

export function brandedTitle(locale: AppLocale, title: string): string {
  return brandTitle[locale](title);
}

// The card prints the brand in its own footer, so the title on it drops the D-1 brand suffix
// (" | " in en, the fullwidth "｜" in zh-HK).
const brandSuffix = new RegExp(`\\s*[|｜]\\s*${siteConfig.publicBrand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
function cardTitle(title: string): string {
  return title.replace(brandSuffix, '').trim() || siteConfig.publicBrand;
}

/**
 * A page that names no image gets a generated 1200x630 card (app/api/og) carrying its own
 * title. The previous default was the WTIA logo PNG: a 2001x721, mostly transparent wordmark
 * sent as a `summary_large_image`, which platforms crop to 1.91:1 and fill with black --
 * measured 2026-10-06, the shared membership, events, showcase, launchpad and news links
 * previewed as half a globe with the dark "WTIA" lettering lost on black.
 */
function defaultCardPath(title: string): string {
  return ogImagePath({kind: 'page', title: cardTitle(title), eyebrow: 'WTIA', imageUrl: null});
}

export function buildPageMetadata({
  locale,
  pathname,
  title,
  description,
  image,
  index = true
}: BuildPageMetadataInput): Metadata {
  const canonical = absoluteUrl(localizedPath(locale, pathname));
  const englishUrl = absoluteUrl(localizedPath('en', pathname));
  const chineseUrl = absoluteUrl(localizedPath('zh-HK', pathname));
  const imageUrl = absoluteUrl(image ?? defaultCardPath(title));

  return {
    title,
    description,
    ...(index ? {} : {robots: {index: false, follow: false}}),
    alternates: {
      canonical,
      languages: {
        en: englishUrl,
        'zh-HK': chineseUrl,
        'x-default': englishUrl // x-default -> English (design D-2): hreflang tags stay zh-HK, not the donor's zh-Hant.
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
