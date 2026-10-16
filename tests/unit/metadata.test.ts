import {describe, expect, it} from 'vitest';

import {buildPageMetadata} from '@/lib/metadata';
import {localizedPath} from '@/lib/urls';

describe('localizedPath', () => {
  it('keeps English unprefixed and uses /zh for zh-HK', () => {
    expect(localizedPath('en', '/membership')).toBe('/membership');
    expect(localizedPath('zh-HK', '/membership')).toBe('/zh/membership');
    expect(localizedPath('zh-HK', '/')).toBe('/zh');
  });

  it('builds canonical and bilingual alternate metadata', () => {
    const metadata = buildPageMetadata({
      locale: 'zh-HK',
      pathname: '/membership',
      title: 'Membership',
      description: 'Membership description'
    });

    expect(metadata.alternates).toEqual({
      canonical: 'http://localhost:3000/zh/membership',
      languages: {
        en: 'http://localhost:3000/membership',
        'zh-HK': 'http://localhost:3000/zh/membership',
        'x-default': 'http://localhost:3000/membership'
      }
    });
  });
});

describe('share image', () => {
  const imageOf = (metadata: ReturnType<typeof buildPageMetadata>) => {
    const images = metadata.openGraph?.images;
    const first = Array.isArray(images) ? images[0] : images;
    return new URL(typeof first === 'object' && first !== null && 'url' in first ? String(first.url) : String(first));
  };

  it('defaults to a generated card titled with the page, not the transparent logo', () => {
    // The logo default (a 2001x721 transparent PNG) previewed as half a globe on black.
    const url = imageOf(buildPageMetadata({locale: 'en', pathname: '/membership', title: 'Membership | WiseTech Hong Kong', description: 'd'}));

    expect(url.pathname).toBe('/api/og');
    expect(url.searchParams.get('kind')).toBe('page');
    expect(url.searchParams.get('title')).toBe('Membership');
  });

  it('drops the zh-HK fullwidth brand suffix from the card title', () => {
    const url = imageOf(buildPageMetadata({locale: 'zh-HK', pathname: '/membership', title: '會員計劃｜WiseTech Hong Kong', description: 'd'}));

    expect(url.searchParams.get('title')).toBe('會員計劃');
  });

  it('uses the brand as the card title when the page title is only the brand', () => {
    const url = imageOf(buildPageMetadata({locale: 'en', pathname: '/', title: 'WiseTech Hong Kong', description: 'd'}));

    expect(url.searchParams.get('title')).toBe('WiseTech Hong Kong');
  });

  it('keeps an image the page names, and sends the same one to Twitter', () => {
    const metadata = buildPageMetadata({locale: 'en', pathname: '/x', title: 'X', description: 'd', image: '/images/about-hero.jpg'});

    expect(imageOf(metadata).pathname).toBe('/images/about-hero.jpg');
    expect(metadata.twitter).toMatchObject({images: ['http://localhost:3000/images/about-hero.jpg']});
  });
});
