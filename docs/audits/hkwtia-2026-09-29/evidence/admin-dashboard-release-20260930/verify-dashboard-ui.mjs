import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const origin = 'https://hkwtia-mizk4mnqo-ynwaforevers-projects.vercel.app';
(async () => { const browser = await chromium.launch(); const report = { origin, sourceSha: '86c37d7e950736de5609c8e50c4c1a5e71099cb5', mergedSha: 'ab568934471cde8aea18f493a5422653c5d719e0', checks: [], screenshots: [], errors: [] }; try {
    const context = await browser.newContext({ storageState: 'test-results/m2-auth/staff.json' });
    const page = await context.newPage();
    page.on('pageerror', () => report.errors.push('pageerror'));
    for (const prefix of ['', '/zh']) {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto(origin + prefix + '/admin', { waitUntil: 'networkidle' });
        const queue = page.locator('section[aria-labelledby="admin-dashboard-queues"]');
        const hrefs = await queue.locator('ul a').evaluateAll(xs => xs.map(x => x.getAttribute('href')));
        assert.deepEqual(hrefs, ['/admin/profiles-review', '/admin/listings-review?status=pending_review', '/admin/approvals', '/admin/tasks', '/admin/at-risk', '/admin/news'].map(x => prefix + x));
        const boxes = await queue.locator('ul li').evaluateAll(xs => xs.map(x => ({ y: x.getBoundingClientRect().y, x: x.getBoundingClientRect().x })));
        assert.equal(boxes[0].y, boxes[2].y);
        assert.equal(boxes[3].y, boxes[5].y);
        assert(boxes[3].y > boxes[0].y);
        const appLink = queue.locator('a[href="' + prefix + '/admin/members/queue"]');
        assert.equal(await appLink.count(), 1);
        report.checks.push({ locale: prefix || 'en', reviewOrder: true, desktopThreeByTwo: true, applicationProgressLink: true });
        for (const width of [320, 390, 768, 1024, 1280, 1440, 1920]) {
            await page.setViewportSize({ width, height: 1000 });
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
            assert.equal(overflow, false, 'overflow at ' + prefix + ' ' + width);
            report.checks.push({ locale: prefix || 'en', width, noHorizontalOverflow: true });
            if ([390, 1440].includes(width)) {
                const filename = 'dashboard-' + (prefix ? 'zh' : 'en') + '-' + width + '.png';
                await page.screenshot({ path: '.playwright/' + filename, fullPage: true });
                report.screenshots.push(filename);
                const results = await new AxeBuilder({ page }).analyze();
                const violations = results.violations.filter(v => ['critical', 'serious'].includes(v.impact));
                assert.deepEqual(violations.map(v => v.id), []);
                report.checks.push({ locale: prefix || 'en', width, seriousOrCriticalAxe: 0 });
            }
        }
        await appLink.click();
        await page.waitForURL('**' + prefix + '/admin/members/queue');
        await page.locator('main h1').waitFor({ state: 'visible' });
        assert.equal(await page.locator('main h1').count(), 1);
        report.checks.push({ locale: prefix || 'en', applicationProgressNavigation: true });
    }
    assert.deepEqual(report.errors, []);
    report.passed = true;
    fs.writeFileSync('.playwright/dashboard-ui-acceptance.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
}
finally {
    await browser.close();
} })().catch(e => { console.error(e.message); process.exitCode = 1; });
