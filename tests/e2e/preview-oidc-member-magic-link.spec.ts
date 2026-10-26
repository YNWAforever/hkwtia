import {existsSync, readFileSync} from 'node:fs';

import {expect, test} from '../fixtures/preview-oidc';

// Opt-in member magic-link run against a Vercel-protected PR Preview through the OIDC fixture.
//   PLAYWRIGHT_PREVIEW_OIDC=true PLAYWRIGHT_BASE_URL=https://<preview>.vercel.app \
//   PREVIEW_LOGIN_EMAIL_FILE=/tmp/<0600 file holding the address>   # or PREVIEW_LOGIN_HANDOFF=true
//   PREVIEW_MAGIC_LINK_FILE=/tmp/<file the pasted link is written to> \
//     vercel env run -- npx playwright test tests/e2e/preview-oidc-member-magic-link.spec.ts
// One page does send -> (wait for the link) -> open -> /portal, so the verifier exchange runs in the
// same OIDC context that requested the link. Without an email source the send happens by hand in a
// headed window (PREVIEW_LOGIN_HANDOFF=true): a person types the address and clicks Send; the spec
// only waits for `?sent=1`. A pasted link may be written to PREVIEW_MAGIC_LINK_FILE or typed into
// that window's address bar. Nothing here logs the address, the link, cookies or the OIDC header.
const HANDOFF = process.env.PREVIEW_LOGIN_HANDOFF === 'true';
const LINK_FILE = process.env.PREVIEW_MAGIC_LINK_FILE;
const LINK_WAIT_MS = Number(process.env.PREVIEW_MAGIC_LINK_WAIT_MS ?? 30 * 60_000);
const SEND_WAIT_MS = HANDOFF ? 15 * 60_000 : 30_000;
const NEON_AUTH_HOST = /^[a-z0-9-]+\.neonauth\.[a-z0-9.-]+\.neon\.tech$/;

test.use({storageState: {cookies: [], origins: []}, trace: 'off', video: 'off', screenshot: 'off', headless: !HANDOFF});
test.setTimeout(LINK_WAIT_MS + SEND_WAIT_MS + 120_000);

function loginEmail(): string | null {
  const file = process.env.PREVIEW_LOGIN_EMAIL_FILE;
  if (!file || !existsSync(file)) return null;
  const value = readFileSync(file, 'utf8').trim();
  return value || null;
}

// Fixed-code refusal so a bad paste never lands on an arbitrary host or appears in output.
export function allowedMagicLink(raw: string, previewOrigin: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('MAGIC_LINK_UNPARSEABLE');
  }
  if (url.protocol !== 'https:') throw new Error('MAGIC_LINK_NOT_HTTPS');
  if (url.origin !== previewOrigin && !NEON_AUTH_HOST.test(url.hostname)) throw new Error('MAGIC_LINK_HOST_REFUSED');
  return url.toString();
}

test('member magic link on Preview: send, open in the same context, /portal session sticks', async ({page, baseURL, previewOidc}) => {
  test.skip(!previewOidc, 'Set PLAYWRIGHT_PREVIEW_OIDC=true with a Preview PLAYWRIGHT_BASE_URL');
  const email = loginEmail();
  test.skip(!email && !HANDOFF, 'Set PREVIEW_LOGIN_EMAIL_FILE or PREVIEW_LOGIN_HANDOFF=true');
  const origin = new URL(baseURL!).origin;

  // 1. Clean jar (storageState above) + clear the resend cooldown that cookie clearing leaves behind.
  const response = await page.goto('/member-login');
  expect(response?.status()).toBe(200);
  await page.evaluate(() => {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith('hkwtia-login-')) sessionStorage.removeItem(key);
  });
  await page.reload();
  const input = page.locator('#member-login-email');
  await expect(input).toBeVisible();

  // 2. Send. Real keystrokes so React's controlled `email` state follows the field.
  if (email) {
    await input.click();
    await input.pressSequentially(email, {delay: 15});
    await expect(input).toHaveValue(email);
    await page.locator('form').filter({has: input}).locator('button[type="submit"]').click();
  } else {
    console.log('[handoff] Type the member email in the headed window and click Send.');
  }
  await page.waitForURL((url) => url.origin === origin && url.searchParams.get('sent') === '1', {timeout: SEND_WAIT_MS});
  await expect(page.getByRole('status')).toBeVisible();
  console.log('[send] ?sent=1 reached on the Preview origin');

  // 3. Wait for the link: a file write, or a navigation typed into this window.
  const deadline = Date.now() + LINK_WAIT_MS;
  let opened = false;
  while (Date.now() < deadline) {
    if (new URL(page.url()).pathname.replace(/^\/(en|zh)(?=\/)/, '').startsWith('/portal')) {
      opened = true;
      break;
    }
    if (LINK_FILE && existsSync(LINK_FILE) && readFileSync(LINK_FILE, 'utf8').trim()) {
      const link = allowedMagicLink(readFileSync(LINK_FILE, 'utf8'), origin);
      await page.goto(link);
      opened = true;
      break;
    }
    await page.waitForTimeout(2_000);
  }
  expect(opened, 'no magic link was provided before the wait expired').toBe(true);

  // 4. The verifier exchange must leave the session on /portal, not on /member-login.
  await page.waitForURL((url) => url.origin === origin && /^\/(?:(?:en|zh)\/)?portal(?:\/|$)/.test(url.pathname), {timeout: 60_000});
  expect(new URL(page.url()).searchParams.has('neon_auth_session_verifier')).toBe(false);
  console.log(`[open] landed on ${new URL(page.url()).pathname}`);
  const again = await page.goto('/portal');
  expect(again?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toMatch(/^\/(?:(?:en|zh)\/)?portal(?:\/|$)/);
  console.log(`[sticky] /portal reload stays on ${new URL(page.url()).pathname}`);
});
