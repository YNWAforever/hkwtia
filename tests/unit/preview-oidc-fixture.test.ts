import {describe, expect, it} from 'vitest';

import {isPreviewOrigin, previewOidcPlan} from '../fixtures/preview-oidc';

const PREVIEW = 'https://hkwtia-abc123-ynwaforevers-projects.vercel.app';
const TOKEN = 'secret-oidc-token-value';

describe('previewOidcPlan', () => {
  it('is a no-op unless explicitly opted in', () => {
    expect(previewOidcPlan({PLAYWRIGHT_BASE_URL: PREVIEW, VERCEL_OIDC_TOKEN: TOKEN})).toBeNull();
    expect(previewOidcPlan({PLAYWRIGHT_PREVIEW_OIDC: '1', PLAYWRIGHT_BASE_URL: PREVIEW, VERCEL_OIDC_TOKEN: TOKEN})).toBeNull();
  });

  it('returns the Preview origin and token when opted in', () => {
    expect(previewOidcPlan({PLAYWRIGHT_PREVIEW_OIDC: 'true', PLAYWRIGHT_BASE_URL: `${PREVIEW}/membership`, VERCEL_OIDC_TOKEN: TOKEN}))
      .toEqual({origin: PREVIEW, token: TOKEN});
  });

  it.each([
    ['https://hkwtia.vercel.app', 'PREVIEW_OIDC_PRODUCTION_TARGET_FORBIDDEN'],
    ['http://hkwtia-abc.vercel.app', 'PREVIEW_OIDC_REQUIRES_HTTPS_VERCEL_PREVIEW'],
    ['https://evil.hkwtia-abc.vercel.app', 'PREVIEW_OIDC_REQUIRES_HTTPS_VERCEL_PREVIEW'],
    ['https://hkwtia-abc.vercel.app.evil.com', 'PREVIEW_OIDC_REQUIRES_HTTPS_VERCEL_PREVIEW'],
    ['https://wtia.org.hk', 'PREVIEW_OIDC_REQUIRES_HTTPS_VERCEL_PREVIEW'],
    ['http://localhost:3000', 'PREVIEW_OIDC_REQUIRES_HTTPS_VERCEL_PREVIEW'],
    ['not a url', 'PREVIEW_OIDC_REQUIRES_HTTPS_VERCEL_PREVIEW'],
  ])('refuses %s', (base, code) => {
    expect(() => previewOidcPlan({PLAYWRIGHT_PREVIEW_OIDC: 'true', PLAYWRIGHT_BASE_URL: base, VERCEL_OIDC_TOKEN: TOKEN})).toThrow(code);
  });

  it('requires a base url and a token, and never echoes the token', () => {
    expect(() => previewOidcPlan({PLAYWRIGHT_PREVIEW_OIDC: 'true', VERCEL_OIDC_TOKEN: TOKEN})).toThrow('PREVIEW_OIDC_BASE_URL_REQUIRED');
    expect(() => previewOidcPlan({PLAYWRIGHT_PREVIEW_OIDC: 'true', PLAYWRIGHT_BASE_URL: PREVIEW})).toThrow('PREVIEW_OIDC_TOKEN_MISSING');
    try {
      previewOidcPlan({PLAYWRIGHT_PREVIEW_OIDC: 'true', PLAYWRIGHT_BASE_URL: 'https://hkwtia.vercel.app', VERCEL_OIDC_TOKEN: TOKEN});
    } catch (error) {
      expect(String(error)).not.toContain(TOKEN);
    }
  });
});

describe('isPreviewOrigin', () => {
  it('matches the exact Preview origin only', () => {
    expect(isPreviewOrigin(`${PREVIEW}/_next/static/x.js`, PREVIEW)).toBe(true);
    expect(isPreviewOrigin('https://accounts.google.com/o/oauth2', PREVIEW)).toBe(false);
    expect(isPreviewOrigin(`${PREVIEW}.evil.com/`, PREVIEW)).toBe(false);
    expect(isPreviewOrigin('https://fonts.gstatic.com/x.woff2', PREVIEW)).toBe(false);
    expect(isPreviewOrigin('data:text/plain,hi', PREVIEW)).toBe(false);
  });
});
