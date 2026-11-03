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
    const title = 'Membership｜Hong Kong Wireless Technology Industry Association (WTIA)';
    const metadata = buildPageMetadata({locale: 'en', pathname: '/membership', title, description: 'd'});
    const url = imageOf(metadata);
    const image = Array.isArray(metadata.openGraph?.images) ? metadata.openGraph?.images[0] : metadata.openGraph?.images;

    expect(url.pathname).toBe('/api/og');
    expect(url.searchParams.get('kind')).toBe('page');
    expect(url.searchParams.get('title')).toBe('Membership');
    expect(image).toMatchObject({width: 1200, height: 630, alt: title});
    expect(metadata.twitter).toMatchObject({images: [{url: url.toString(), width: 1200, height: 630, alt: title}]});
  });

  it('drops the zh-HK fullwidth brand suffix from the card title', () => {
    const url = imageOf(buildPageMetadata({locale: 'zh-HK', pathname: '/membership', title: '會員計劃｜香港無線科技商會 WTIA', description: 'd'}));

    expect(url.searchParams.get('title')).toBe('會員計劃');
  });

  it('uses the brand as the card title when the page title is only the brand', () => {
    const url = imageOf(buildPageMetadata({locale: 'en', pathname: '/', title: 'WTIA', description: 'd'}));

    expect(url.searchParams.get('title')).toBe('WTIA');
  });

  it('keeps an image the page names, and sends the same one to Twitter', () => {
    const metadata = buildPageMetadata({locale: 'en', pathname: '/x', title: 'X', description: 'd', image: '/images/about-hero.jpg'});

    expect(imageOf(metadata).pathname).toBe('/images/about-hero.jpg');
    expect(metadata.twitter).toMatchObject({images: [{url: 'http://localhost:3000/images/about-hero.jpg', alt: 'X'}]});
    expect(metadata.openGraph?.images).toEqual([{url: 'http://localhost:3000/images/about-hero.jpg', alt: 'X'}]);
  });

  it('sizes a caller-supplied generated card at 1200 by 630', () => {
    const title = 'Home｜Hong Kong Wireless Technology Industry Association (WTIA)';
    const metadata = buildPageMetadata({
      locale: 'en',
      pathname: '/',
      title,
      description: 'd',
      image: '/api/og?kind=page&title=How&eyebrow=WTIA'
    });

    expect(metadata.openGraph?.images).toEqual([{
      url: 'http://localhost:3000/api/og?kind=page&title=How&eyebrow=WTIA',
      width: 1200,
      height: 630,
      alt: title
    }]);
  });
});
