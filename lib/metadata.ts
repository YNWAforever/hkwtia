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

// Every public <title> uses the Phase 0 legal suffix (fullwidth bar, both locales).
// Pages whose title is a record name (events, news, showcase, history) or a lowercase-namespace
// programme title cannot carry the suffix in the message bundle, so they brand here. Exhaustive
// over AppLocale so adding a locale fails typecheck rather than silently falling into one branch.
const brandTitle: Record<AppLocale, (title: string) => string> = {
  en: (title) => `${title}｜${siteConfig.titleSuffix.en}`,
  'zh-HK': (title) => `${title}｜${siteConfig.titleSuffix['zh-HK']}`
};

export function brandedTitle(locale: AppLocale, title: string): string {
  return brandTitle[locale](title);
}

// The card prints the short brand in its own footer, so the title on it drops the legal suffix.
function cardTitle(title: string): string {
  for (const suffix of [siteConfig.titleSuffix.en, siteConfig.titleSuffix['zh-HK']]) {
    const marker = `｜${suffix}`;
    if (title.endsWith(marker)) {
      return title.slice(0, -marker.length).trim() || siteConfig.publicBrand;
    }
  }
  return title.trim() || siteConfig.publicBrand;
}

/**
 * A page that names no image gets a generated 1200x630 card (app/api/og) carrying its own
 * title. The previous default was the WTIA logo PNG: a 2001x721, mostly transparent wordmark
 * sent as a `summary_large_image`, which platforms crop to 1.91:1 and fill with black --
 * measured 2026-10-06, the shared membership, events, showcase, launchpad and news links
 * previewed as half a globe with the dark "WTIA" lettering lost on black.
 */
function defaultCardPath(title: string, locale: AppLocale): string {
  return ogImagePath({kind: 'page', title: cardTitle(title), eyebrow: 'WTIA', imageUrl: null, locale});
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
  const imagePath = image ?? defaultCardPath(title, locale);
  const imageUrl = absoluteUrl(imagePath);
  // Alt is the page title, which already carries the legal name on branded pages.
  // Width and height describe the generated 1200×630 card, including pages that
  // pass that card path themselves. A caller-supplied photograph is left unsized.
  const shareImage = imagePath.startsWith('/api/og')
    ? {url: imageUrl, width: 1200, height: 630, alt: title}
    : {url: imageUrl, alt: title};

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
      images: [shareImage]
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [shareImage]
    }
  };
}
