import {existsSync, readFileSync} from 'node:fs';

import type {Page} from '@playwright/test';

import {expect, test} from '../fixtures/preview-oidc';
import {allowedMagicLink} from '../fixtures/preview-magic-link';

// Opt-in staff magic-link run against a Vercel-protected PR Preview through the OIDC fixture.
//   PLAYWRIGHT_PREVIEW_OIDC=true PLAYWRIGHT_BASE_URL=https://<preview>.vercel.app \
//   PREVIEW_LOGIN_HANDOFF=true            # or PREVIEW_LOGIN_EMAIL_FILE=/tmp/<0600 file>
//   PREVIEW_MAGIC_LINK_FILE=/tmp/<file the pasted link is written to> \
//     vercel env run -- npx playwright test tests/e2e/preview-oidc-staff-magic-link.spec.ts
// Google is disabled on Preview (AUTH_GOOGLE_ENABLED unset), so staff sign in by magic link on
// /admin-login. The staff Auth user needs a staff/exco/superadmin `profiles` row on the Preview DB;
// otherwise /admin-login renders the "profile recovery" state and the run fails with NEEDS_PROFILE.
// Read-only: after sign-in it only visits /admin, reloads it, and checks /portal -> /admin. No form,
// approval, queue action or message. Nothing logs the address, link, cookies or the OIDC header.
// A link pasted into ANY tab of this window (address bar or a new tab) is picked up, so the
// second-tab stall seen in the member A handoff cannot recur.
const HANDOFF = process.env.PREVIEW_LOGIN_HANDOFF === 'true';
const LINK_FILE = process.env.PREVIEW_MAGIC_LINK_FILE;
const LINK_WAIT_MS = Number(process.env.PREVIEW_MAGIC_LINK_WAIT_MS ?? 30 * 60_000);
const SEND_WAIT_MS = HANDOFF ? 15 * 60_000 : 30_000;
const ADMIN_PATH = /^\/(?:(?:en|zh)\/)?admin(?:\/|$)/;
const ADMIN_LOGIN_PATH = /^\/(?:(?:en|zh)\/)?admin-login(?:\/|$)/;

test.use({storageState: {cookies: [], origins: []}, trace: 'off', video: 'off', screenshot: 'off', headless: !HANDOFF});
test.setTimeout(LINK_WAIT_MS + SEND_WAIT_MS + 180_000);

function loginEmail(): string | null {
  const file = process.env.PREVIEW_LOGIN_EMAIL_FILE;
  if (!file || !existsSync(file)) return null;
  const value = readFileSync(file, 'utf8').trim();
  return value || null;
}

type Landing = 'pending' | 'admin' | 'needs-profile' | 'forbidden';

async function landing(candidate: Page, origin: string): Promise<Landing> {
  let url: URL;
  try {
    url = new URL(candidate.url());
  } catch {
    return 'pending';
  }
  if (url.origin !== origin || url.searchParams.has('neon_auth_session_verifier')) return 'pending';
  if (ADMIN_PATH.test(url.pathname) && !ADMIN_LOGIN_PATH.test(url.pathname)) return 'admin';
  if (ADMIN_LOGIN_PATH.test(url.pathname)) {
    // Signed-in states on /admin-login have no email field: profile recovery (no profile) or AccessDenied (member).
    const field = await candidate.locator('#admin-login-email').count().catch(() => 1);
    if (field > 0) return 'pending';
    const recovery = await candidate.getByRole('alert').filter({has: candidate.locator('a[href*="member-login"]')}).count().catch(() => 0);
    return recovery > 0 ? 'needs-profile' : 'forbidden';
  }
  return 'pending';
}

test('staff magic link on Preview: send, open, /admin session sticks and /portal redirects to /admin', async ({page, context, baseURL, previewOidc}) => {
  test.skip(!previewOidc, 'Set PLAYWRIGHT_PREVIEW_OIDC=true with a Preview PLAYWRIGHT_BASE_URL');
  const email = loginEmail();
  test.skip(!email && !HANDOFF, 'Set PREVIEW_LOGIN_EMAIL_FILE or PREVIEW_LOGIN_HANDOFF=true');
  const origin = new URL(baseURL!).origin;

  // 1. Clean jar + clear the resend cooldown kept in sessionStorage.
  const response = await page.goto('/admin-login');
  expect(response?.status()).toBe(200);
  await page.evaluate(() => {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith('hkwtia-login-')) sessionStorage.removeItem(key);
  });
  await page.reload();
  const input = page.locator('#admin-login-email');
  await expect(input).toBeVisible();

  // 2. Send.
  if (email) {
    await input.click();
    await input.pressSequentially(email, {delay: 15});
    await expect(input).toHaveValue(email);
    await page.getByTestId('admin-login-form').locator('button[type="submit"]').click();
  } else {
    console.log('[handoff] Type the staff email in the headed window and click Send.');
  }
  await page.waitForURL((url) => url.origin === origin && url.searchParams.get('sent') === '1', {timeout: SEND_WAIT_MS});
  await expect(page.getByRole('status')).toBeVisible();
  console.log('[send] ?sent=1 reached on /admin-login (Preview origin)');

  // 3. Wait for the link in any tab of this context, or via PREVIEW_MAGIC_LINK_FILE.
  const deadline = Date.now() + LINK_WAIT_MS;
  let active: Page | null = null;
  let fileUsed = false;
  while (Date.now() < deadline && !active) {
    for (const candidate of context.pages()) {
      const state = await landing(candidate, origin);
      if (state !== 'pending') {
        active = candidate;
        break;
      }
    }
    if (active) break;
    if (!fileUsed && LINK_FILE && existsSync(LINK_FILE) && readFileSync(LINK_FILE, 'utf8').trim()) {
      fileUsed = true;
      await page.goto(allowedMagicLink(readFileSync(LINK_FILE, 'utf8'), origin));
    }
    await page.waitForTimeout(2_000);
  }
  expect(active, 'no signed-in Preview tab appeared before the wait expired').not.toBeNull();
  const staffPage = active!;
  const outcome = await landing(staffPage, origin);
  console.log(`[open] landed on ${new URL(staffPage.url()).pathname} (${outcome})`);
  expect(outcome, outcome === 'needs-profile' ? 'NEEDS_PROFILE: grant a staff profile on the Preview DB' : 'staff should reach /admin').toBe('admin');
  expect(new URL(staffPage.url()).searchParams.has('neon_auth_session_verifier')).toBe(false);

  // 4. Sticky: fresh /admin load stays in the staff workspace.
  const again = await staffPage.goto('/admin');
  expect(again?.status()).toBe(200);
  expect(new URL(staffPage.url()).pathname).toMatch(ADMIN_PATH);
  expect(new URL(staffPage.url()).pathname).not.toMatch(ADMIN_LOGIN_PATH);
  console.log(`[sticky] /admin reload stays on ${new URL(staffPage.url()).pathname}`);

  // 5. Separation: staff are sent from /portal back to /admin.
  await staffPage.goto('/portal');
  await staffPage.waitForURL((url) => ADMIN_PATH.test(url.pathname) && !ADMIN_LOGIN_PATH.test(url.pathname), {timeout: 30_000});
  console.log(`[separation] /portal redirected to ${new URL(staffPage.url()).pathname}`);
});
