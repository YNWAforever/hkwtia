import http from 'node:http';
import type {AddressInfo} from 'node:net';
import {expect, test} from '@playwright/test';

import {PREVIEW_OIDC_HEADER, previewOidcReady, routePreviewOidc} from '../fixtures/preview-oidc';

// Hermetic (two loopback servers, no Vercel): proves the Preview OIDC header rides on every
// Preview-origin hop — including same-origin redirect hops — and on no other origin, including
// redirect hops that leave the Preview (the OAuth / Stripe shape).
test.use({trace: 'off', video: 'off'});

function serve(handler: http.RequestListener) {
  const server = http.createServer(handler);
  return new Promise<{origin: string; close: () => void}>((resolve) => server.listen(0, '127.0.0.1', () => {
    resolve({origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close()});
  }));
}

test('Preview OIDC header is scoped to the Preview origin across redirects', async ({browser}) => {
  const seen: Record<string, string> = {};
  const record = (key: string, req: http.IncomingMessage) => {seen[key] = String(req.headers[PREVIEW_OIDC_HEADER] ?? 'NONE');};
  let previewOrigin = '';
  const other = await serve((req, res) => {
    record(`other${req.url}`, req);
    if (req.url === '/back') {res.writeHead(302, {location: `${previewOrigin}/final`}); return res.end();}
    res.end('<h1>Other</h1>');
  });
  const preview = await serve((req, res) => {
    record(`preview${req.url}`, req);
    if (req.url === '/same') {res.writeHead(307, {location: '/landed'}); return res.end();}
    if (req.url === '/cross') {res.writeHead(302, {location: `${other.origin}/oauth`}); return res.end();}
    if (req.url === '/roundtrip') {res.writeHead(302, {location: `${other.origin}/back`}); return res.end();}
    res.end(`<h1>Preview</h1><img src="${other.origin}/font.png"><script src="/app.js"></script>`);
  });
  previewOrigin = preview.origin;
  const context = await browser.newContext();
  try {
    await routePreviewOidc(context, {origin: preview.origin, token: 'test-token'});
    const page = await context.newPage();
    await previewOidcReady(page);
    await page.goto(`${preview.origin}/same`, {waitUntil: 'load'});
    expect(page.url()).toBe(`${preview.origin}/landed`);
    await page.goto(`${preview.origin}/cross`);
    expect(page.url()).toBe(`${other.origin}/oauth`);
    await page.goto(`${preview.origin}/roundtrip`);
    expect(page.url()).toBe(`${preview.origin}/final`);
    expect(seen).toEqual({
      'preview/same': 'test-token',
      'preview/landed': 'test-token',
      'preview/app.js': 'test-token',
      'other/font.png': 'NONE',
      'preview/cross': 'test-token',
      'other/oauth': 'NONE',
      'preview/roundtrip': 'test-token',
      'other/back': 'NONE',
      'preview/final': 'test-token',
      ...(seen['preview/favicon.ico'] ? {'preview/favicon.ico': 'test-token'} : {}),
    });
  } finally {
    await context.close();
    preview.close();
    other.close();
  }
});
