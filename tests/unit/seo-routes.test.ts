import {describe, expect, it} from 'vitest';

import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import {publicRoutes} from '@/config/public-routes';

describe('M0 indexability', () => {
  it('lists both locales for every public route', async () => {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    const urls = (await sitemap()).map((entry) => entry.url);
    for (const path of publicRoutes) {
      expect(urls).toContain(new URL(path, siteUrl).toString());
      expect(urls).toContain(
        new URL(path === '/' ? '/zh' : `/zh${path}`, siteUrl).toString(),
      );
    }
  });

  it('allows required AI crawlers', () => {
    const rules = robots().rules;
    const list = Array.isArray(rules) ? rules : [rules];
    expect(list.flatMap((rule) => rule.userAgent ?? [])).toEqual(
      expect.arrayContaining(['GPTBot', 'ClaudeBot', 'PerplexityBot']),
    );
  });

  it('keeps authenticated and mid-flow surfaces out of every crawler', () => {
    const rules = robots().rules;
    const list = Array.isArray(rules) ? rules : [rules];
    expect(list.length).toBeGreaterThanOrEqual(1);
    for (const rule of list) {
      expect(rule.disallow).toEqual(['/portal', '/admin', '/member-login', '/join/profile', '/join/company', '/join/checkout', '/join/complete', '/unsubscribe', '/api']);
    }
  });
});
