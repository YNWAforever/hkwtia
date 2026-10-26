import {existsSync, readFileSync} from 'node:fs';

import {expect, test} from '../fixtures/preview-oidc';

// Opt-in member magic-link run against a Vercel-protected PR Preview through the OIDC fixture.
//   PLAYWRIGHT_PREVIEW_OIDC=true PLAYWRIGHT_BASE_URL=https://<preview>.vercel.app \
//   PREVIEW_LOGIN_EMAIL_FILE=/tmp/<0600 file holding the address>   # or PREVIEW_LOGIN_HANDOFF=true
//   PREVIEW_MAGIC_LINK_FILE=/tmp/<file the pasted link is written to> \
//     vercel env run -- npx playwright test tests/e2e/preview-oidc-member-magic-link.spec.ts
// One page does send -> (wait for the link) -> open -> /portal or the verified create-profile screen, so the verifier exchange runs in the
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

test('member magic link on Preview: send, open in the same context, session sticks (/portal or create-profile)', async ({page, baseURL, previewOidc}) => {
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
    // An address-bar paste shows up as a navigation away from the ?sent=1 screen: the Neon Auth host,
    // a verifier callback, /portal, or the verified create-profile form.
    const current = new URL(page.url());
    if (
      NEON_AUTH_HOST.test(current.hostname) ||
      current.searchParams.has('neon_auth_session_verifier') ||
      current.pathname.replace(/^\/(en|zh)(?=\/)/, '').startsWith('/portal') ||
      (await page.getByTestId('profile-provision-form').isVisible().catch(() => false))
    ) {
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

  // 4. The verifier exchange must leave a session, not a signed-out /member-login. Two outcomes count:
  //    (a) "portal": the member has a profile -> sticky /portal;
  //    (b) "needs-profile": verified identity without a Preview profile -> /member-login renders the
  //        provision form ("Create member profile"). The form is never submitted here (no profile write).
  const portalPath = /^\/(?:(?:en|zh)\/)?portal(?:\/|$)/;
  const loginPath = /^\/(?:(?:en|zh)\/)?member-login(?:\/|$)/;
  const provisionForm = page.getByTestId('profile-provision-form');
  await expect
    .poll(
      async () => {
        const url = new URL(page.url());
        if (url.origin !== origin || url.searchParams.has('neon_auth_session_verifier')) return 'pending';
        if (portalPath.test(url.pathname)) return 'portal';
        if (loginPath.test(url.pathname) && (await provisionForm.isVisible().catch(() => false))) return 'needs-profile';
        return 'pending';
      },
      {timeout: 60_000, intervals: [1_000]},
    )
    .not.toBe('pending');
  const landed = new URL(page.url());
  expect(landed.searchParams.has('neon_auth_session_verifier')).toBe(false);
  const outcome = portalPath.test(landed.pathname) ? 'portal' : 'needs-profile';
  console.log(`[open] landed on ${landed.pathname} (${outcome})`);

  if (outcome === 'portal') {
    const again = await page.goto('/portal');
    expect(again?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toMatch(portalPath);
    console.log(`[sticky] /portal reload stays on ${new URL(page.url()).pathname}`);
    return;
  }

  // Session sticks for a verified-no-profile identity: a fresh /member-login load still resolves
  // "needs-profile" (provision form shown, signed-out email field absent).
  const again = await page.goto('/member-login');
  expect(again?.status()).toBe(200);
  await expect(provisionForm).toBeVisible();
  await expect(page.locator('#member-login-email')).toHaveCount(0);
  console.log('[sticky] /member-login reload still shows the verified create-member-profile state');
});
