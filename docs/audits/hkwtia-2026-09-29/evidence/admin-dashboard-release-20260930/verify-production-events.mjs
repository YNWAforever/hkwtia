import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser = await chromium.launch();
const report = {origin: 'https://hkwtia.vercel.app', at: new Date().toISOString(), checks: [], pageErrors: []};
try {
  for (let round = 1; round <= 2; round++) {
    for (const path of ['/events', '/zh/events']) {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        page.on('pageerror', () => report.pageErrors.push('pageerror'));
        const response = await page.goto(report.origin + path, {waitUntil: 'networkidle', timeout: 60000});
        const heading = await page.locator('main h1').innerText();
        const content = await page.locator('main').innerText();
        assert.equal(response.status(), 200);
        assert.equal(heading, path === '/events' ? 'Events' : '活動');
        assert(!/頁面未能載入|暫時無法|could not be loaded|temporarily unavailable/i.test(content));
        report.checks.push({round, path, status: response.status(), heading, rendered: true});
      } finally { await context.close(); }
    }
  }
  assert.equal(report.pageErrors.length, 0);
  report.passed = true;
  fs.writeFileSync('.playwright/production-events-probe.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
