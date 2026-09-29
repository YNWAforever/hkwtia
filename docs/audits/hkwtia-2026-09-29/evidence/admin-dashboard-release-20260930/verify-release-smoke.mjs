import fs from "node:fs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
const origin = process.argv[2];
const mode = origin === 'https://hkwtia.vercel.app' ? 'production' : origin === 'https://hkwtia-ejx0uet7r-ynwaforevers-projects.vercel.app' ? 'stage' : null;
if (!mode)
    throw Error('SMOKE_ORIGIN_GUARD');
(async () => { const b = await chromium.launch(); const report = { origin, mode, sha: 'ab568934471cde8aea18f493a5422653c5d719e0', at: new Date().toISOString(), checks: [], pageErrors: [] }; try {
    const c = await b.newContext();
    if (mode === 'stage') {
        const r = spawnSync(process.execPath, ['C:/Users/laich/AppData/Roaming/npm/node_modules/vercel/dist/index.js', 'api', '/v9/projects/prj_lT7YZDueA6kzhz2xrPPHFyNsDf8n', '--scope', 'ynwaforevers-projects'], { encoding: 'utf8', windowsHide: true });
        assert.equal(r.status, 0);
        const secret = Object.keys(JSON.parse(r.stdout).protectionBypass ?? {})[0];
        assert(secret);
        const gate = await c.request.get(origin + '/zh/member-login', { headers: { 'x-vercel-protection-bypass': secret, 'x-vercel-set-bypass-cookie': 'true' } });
        assert.equal(gate.status(), 200);
    }
    const p = await c.newPage();
    p.on('pageerror', () => report.pageErrors.push('pageerror'));
    for (const path of ['/', '/zh', '/member-login', '/zh/member-login', '/admin-login', '/zh/admin-login', '/members', '/zh/members']) {
        const r = await p.goto(origin + path, { waitUntil: 'networkidle' });
        assert.equal(r.status(), 200, path);
        await p.locator('main').waitFor({ state: 'visible' });
        const visible = await p.locator('body').innerText();
        assert(!/登入暫時無法使用|頁面未能載入|temporarily unavailable|could not be loaded/i.test(visible), path + ' recovery state');
        if (path.includes('login'))
            await p.locator('input[type=email]').waitFor({ state: 'visible' });
        report.checks.push({ path, status: r.status(), rendered: true });
        if (mode === 'production' && path === '/zh/admin-login')
            await p.screenshot({ path: '.playwright/production-admin-login.png', fullPage: true });
    }
    for (const path of ['/admin', '/zh/admin']) {
        const r = await c.request.get(origin + path, { maxRedirects: 0 });
        assert([303, 307].includes(r.status()));
        const location = r.headers().location;
        assert(new URL(location, origin).pathname.endsWith('/admin-login'));
        report.checks.push({ path, status: r.status(), deniedAnonymous: true });
    }
    assert.deepEqual(report.pageErrors, []);
    report.passed = true;
    fs.writeFileSync('.playwright/' + mode + '-release-smoke.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
}
finally {
    await b.close();
} })().catch(e => { console.error(e.message); process.exitCode = 1; });
