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
        'zh-HK': 'http://localhost:3000/zh/membership'
      }
    });
  });
});
