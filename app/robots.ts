import type {MetadataRoute} from 'next';

import {absoluteUrl} from '@/lib/urls';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {userAgent: '*', allow: ['/']},
      {userAgent: 'GPTBot', allow: ['/']},
      {userAgent: 'ClaudeBot', allow: ['/']},
      {userAgent: 'PerplexityBot', allow: ['/']},
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
