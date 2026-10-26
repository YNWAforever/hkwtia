// Read-only Lighthouse lab pass on a Vercel-protected PR Preview (UC22-57), using the box's
// development OIDC token via Deployment Protection Trusted Sources. Never prints the token.
//
//   vercel env run -- node scripts/preview-oidc-lighthouse.mjs https://<preview>.vercel.app [runs]
//
// Why not `lhci collect` with lighthouserc.js: Lighthouse `extraHeaders` (a) rides on every
// request including third-party ones and (b) is copied into `lhr.configSettings`, so the token
// would leave the Preview origin and land on disk. Instead the header is injected per request via
// CDP Fetch scoped to the Preview origin (same mechanism as tests/fixtures/preview-oidc.ts) and the
// LHRs never see it. Same ten URLs, order and mobile-simulated defaults as lighthouserc.js.
// Raw reports go to the ignored .playwright/lighthouse-preview/ directory; summary JSON to stdout.
import {mkdirSync, writeFileSync} from "node:fs";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import puppeteer from "puppeteer-core";
import {chromium} from "playwright";

const HEADER = "x-vercel-trusted-oidc-idp-token";
const VERCEL_PREVIEW_HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/;
const PRODUCTION_HOST = "hkwtia.vercel.app";
const PATHS = process.env.LH_PATHS ? process.env.LH_PATHS.split(",") : ["/", "/membership", "/events", "/programmes", "/partners",
  "/zh", "/zh/membership", "/zh/events", "/zh/programmes", "/zh/partners"];
const OUT = ".playwright/lighthouse-preview";

const target = new URL(process.argv[2] ?? "");
if (target.hostname === PRODUCTION_HOST) throw new Error("PRODUCTION_TARGET_FORBIDDEN");
if (target.protocol !== "https:" || !VERCEL_PREVIEW_HOST.test(target.hostname)) throw new Error("PREVIEW_URL_REQUIRES_HTTPS_VERCEL_PREVIEW");
const token = process.env.VERCEL_OIDC_TOKEN?.trim();
if (!token) throw new Error("VERCEL_OIDC_TOKEN_MISSING (run via `vercel env run --`)");
const origin = target.origin;
const runs = Number(process.argv[3] ?? 3);
mkdirSync(OUT, {recursive: true, mode: 0o700});

const median = (xs) => {
  const s = xs.filter((x) => typeof x === "number").sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const chrome = await chromeLauncher.launch({
  chromePath: chromium.executablePath(),
  chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});
const browser = await puppeteer.connect({browserURL: `http://127.0.0.1:${chrome.port}`, defaultViewport: null});
const rows = [];
try {
  for (const path of PATHS) {
    const samples = [];
    for (let i = 0; i < runs; i++) {
      const page = await browser.newPage();
      const session = await page.createCDPSession();
      session.on("Fetch.requestPaused", (event) => {
        const headers = Object.entries(event.request.headers)
          .filter(([name]) => name.toLowerCase() !== HEADER)
          .map(([name, value]) => ({name, value}));
        let same = false;
        try { same = new URL(event.request.url).origin === origin; } catch {}
        if (same) headers.push({name: HEADER, value: token});
        session.send("Fetch.continueRequest", {requestId: event.requestId, headers}).catch(() => undefined);
      });
      await session.send("Fetch.enable", {patterns: [{urlPattern: `${origin}/*`, requestStage: "Request"}]});
      const result = await lighthouse(origin + path, {output: "json", logLevel: "error",
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"]}, undefined, page);
      await page.close();
      const lhr = result.lhr;
      const json = result.report;
      if (json.includes(token)) throw new Error("TOKEN_FOUND_IN_REPORT");
      const name = `${path === "/" ? "root" : path.slice(1).replace(/\//g, "_")}-${i + 1}.json`;
      writeFileSync(`${OUT}/${name}`, json, {mode: 0o600});
      const items = lhr.audits["network-requests"]?.details?.items ?? [];
      const origins = [...new Set(items.map((it) => { try { return new URL(it.url).origin; } catch { return "?"; } }))];
      samples.push({
        finalUrl: lhr.finalDisplayedUrl,
        runtimeError: lhr.runtimeError?.code ?? null,
        perf: lhr.categories.performance?.score, a11y: lhr.categories.accessibility?.score,
        bp: lhr.categories["best-practices"]?.score, seo: lhr.categories.seo?.score,
        lcp: lhr.audits["largest-contentful-paint"]?.numericValue,
        cls: lhr.audits["cumulative-layout-shift"]?.numericValue,
        tbt: lhr.audits["total-blocking-time"]?.numericValue,
        fcp: lhr.audits["first-contentful-paint"]?.numericValue,
        si: lhr.audits["speed-index"]?.numericValue,
        failedA11y: Object.values(lhr.audits).filter((a) => lhr.categories.accessibility.auditRefs.some((r) => r.id === a.id && r.weight > 0) && a.score === 0).map((a) => a.id),
        failedSeo: Object.values(lhr.audits).filter((a) => lhr.categories.seo.auditRefs.some((r) => r.id === a.id && r.weight > 0) && a.score === 0).map((a) => a.id),
        failedBp: Object.values(lhr.audits).filter((a) => lhr.categories["best-practices"].auditRefs.some((r) => r.id === a.id && r.weight > 0) && a.score === 0).map((a) => a.id),
        origins,
        lighthouseVersion: lhr.lighthouseVersion,
      });
      console.error(`${path} run ${i + 1}: perf=${samples.at(-1).perf} final=${new URL(lhr.finalDisplayedUrl).origin === origin ? new URL(lhr.finalDisplayedUrl).pathname : "OFF_ORIGIN"}`);
    }
    const pick = (k) => median(samples.map((s) => s[k]));
    rows.push({path, runs: samples.length,
      offOrigin: samples.some((s) => new URL(s.finalUrl).origin !== origin),
      runtimeErrors: samples.map((s) => s.runtimeError).filter(Boolean),
      median: {perf: pick("perf"), a11y: pick("a11y"), bp: pick("bp"), seo: pick("seo"), lcp: pick("lcp"), cls: pick("cls"), tbt: pick("tbt"), fcp: pick("fcp"), si: pick("si")},
      failedA11y: [...new Set(samples.flatMap((s) => s.failedA11y))],
      failedSeo: [...new Set(samples.flatMap((s) => s.failedSeo))],
      failedBp: [...new Set(samples.flatMap((s) => s.failedBp))],
      origins: [...new Set(samples.flatMap((s) => s.origins))],
      lighthouseVersion: samples[0]?.lighthouseVersion});
  }
} finally {
  await browser.disconnect();
  await chrome.kill();
}
const summary = {origin, runsPerUrl: runs, rows};
writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2), {mode: 0o600});
console.log(JSON.stringify(summary, null, 2));
