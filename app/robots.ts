import type {MetadataRoute} from 'next';

import {absoluteUrl} from '@/lib/urls';

// Authenticated surfaces (/portal, /admin), the auth hand-off (/member-login), mid-flow join
// steps (the entry page /join stays indexable), token-bearing unsubscribe links, and API routes
// -- none of these belong in a crawler's index (master plan WP-7 SEO row).
const disallow = ['/portal', '/admin', '/member-login', '/join/profile', '/join/company', '/join/checkout', '/join/complete', '/unsubscribe', '/api'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {userAgent: '*', allow: ['/'], disallow},
      {userAgent: 'GPTBot', allow: ['/'], disallow},
      {userAgent: 'ClaudeBot', allow: ['/'], disallow},
      {userAgent: 'PerplexityBot', allow: ['/'], disallow},
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
