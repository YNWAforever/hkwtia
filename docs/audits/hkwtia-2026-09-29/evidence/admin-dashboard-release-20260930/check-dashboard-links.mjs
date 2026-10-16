import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const origin = 'https://hkwtia-mizk4mnqo-ynwaforevers-projects.vercel.app';
(async () => { const b = await chromium.launch(); const results = []; try {
    const c = await b.newContext({ storageState: 'test-results/m2-auth/staff.json' });
    const p = await c.newPage();
    for (const prefix of ['', '/zh']) {
        await p.goto(origin + prefix + '/admin', { waitUntil: 'networkidle' });
        const batches = p.locator('section[aria-labelledby="admin-recent-batches"]');
        const timeCount = await batches.locator('li time').count();
        assert(timeCount > 0);
        const valid = await batches.locator('li time').evaluateAll(xs => xs.every(x => Number.isFinite(Date.parse(x.dateTime))));
        assert(valid);
        const text = await batches.innerText();
        assert(prefix ? /失敗：\d/.test(text) : /Failed: \d/.test(text));
        const recentHref = await batches.locator('li a').first().getAttribute('href');
        const paths = await p.locator('section[aria-labelledby="admin-dashboard-queues"] ul a').evaluateAll(xs => xs.map(x => x.getAttribute('href')));
        for (const path of [...paths, recentHref, prefix + '/admin/batches']) {
            const response = await p.goto(origin + path, { waitUntil: 'networkidle' });
            assert(response && response.status() === 200);
            await p.locator('main h1').waitFor({ state: 'visible' });
            assert(!new URL(p.url()).pathname.includes('admin-login'));
            results.push({ path, status: response.status(), authorized: true });
        }
        results.push({ locale: prefix || 'en', recentTimes: timeCount, validHongKongTimes: true, failureCountVisible: true });
    }
    fs.writeFileSync('.playwright/dashboard-links-acceptance.json', JSON.stringify({ origin, results, passed: true }, null, 2));
    console.log(JSON.stringify({ routes: results.filter(x => x.path).length, locales: 2, passed: true }));
}
finally {
    await b.close();
} })().catch(e => { console.error(e.message); process.exitCode = 1; });
