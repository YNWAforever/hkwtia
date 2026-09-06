import type {MetadataRoute} from 'next';

import {absoluteUrl, localizedPath} from '@/lib/urls';

// Authenticated surfaces (/portal, /admin), the auth hand-off (/member-login), mid-flow join
// steps (the entry page /join stays indexable), token-bearing unsubscribe links, and API routes
// -- none of these belong in a crawler's index (master plan WP-7 SEO row). Every one of these
// surfaces also renders under /zh (zh-HK is served at /zh -- i18n/routing.ts), so the list is
// built from the unprefixed paths below and mirrored with `localizedPath`, the same helper
// app/sitemap.ts uses, rather than hand-building the `/zh` prefix (CLAUDE.md boundary #5). `/api`
// gets no twin: the locale proxy matcher excludes `api`, so nothing under it is ever
// locale-prefixed. These pages also carry `noindex` metadata (tests/unit/page-indexability.test.ts);
// this disallow list is belt-and-braces for crawler budget and for agents that ignore meta robots.
const disallowBase = ['/portal', '/admin', '/member-login', '/join/profile', '/join/company', '/join/checkout', '/join/complete', '/unsubscribe', '/api'];
const disallow = [
  ...disallowBase,
  ...disallowBase.filter((path) => path !== '/api').map((path) => localizedPath('zh-HK', path)),
];

// `/api/media/[id]` delivers public uploaded images (showcase cards/detail, event detail incl.
// its JSON-LD `image`, home highlight cards, the partner wall, /partners) with revocation and
// ETag checks -- see lib/media/url.ts. Every other `app/api/*` handler is auth/jobs/webhooks/AI
// and stays hidden behind the `/api` disallow above. RFC 9309 longest-match: `Allow: /api/media/`
// beats `Disallow: /api` for that prefix.
const allow = ['/', '/api/media/'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {userAgent: '*', allow, disallow},
      {userAgent: 'GPTBot', allow, disallow},
      {userAgent: 'ClaudeBot', allow, disallow},
      {userAgent: 'PerplexityBot', allow, disallow},
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
