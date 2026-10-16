#!/usr/bin/env node
// Diffs the live WordPress sitemaps against content/legacy-urls.json.
//
// The fixture was captured once; hkwtia.org is still live and still publishing. Shapes
// covered by a pattern rule in next.config.ts (/event/, /author/, /category/, ...) are
// drift-proof by construction -- a new event matches /event/:path* whether or not it was
// captured. The literal entries are not, so a page published since capture would have no
// rule and would 404 the moment DNS moves.
//
// Usage: node scripts/check-legacy-drift.mjs [--wordpress https://hkwtia.org]

import {readFileSync} from "node:fs";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const wordpress = (args.get("wordpress") ?? "https://hkwtia.org").replace(/\/$/, "");

// Must match legacyPatternRedirects in next.config.ts.
const PATTERN_PREFIXES = ["/event/", "/faq-items/", "/faq_category/", "/author/", "/category/", "/element_category/"];
const coveredByPattern = (path) => PATTERN_PREFIXES.some((prefix) => path.startsWith(prefix));

const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

async function fetchText(url) {
  const response = await fetch(url, {headers: {"user-agent": "wtia-cutover-drift"}});
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return response.text();
}

const index = await fetchText(`${wordpress}/sitemap.xml`);
const subSitemaps = locs(index).filter((u) => u.endsWith(".xml"));
if (subSitemaps.length === 0) throw new Error("no WordPress sub-sitemaps found; refusing a vacuous drift check");
console.log(`Reading ${subSitemaps.length} sub-sitemaps from ${wordpress}`);

const live = new Set();
const unreadable = [];
for (const sub of subSitemaps) {
  try {
    for (const url of locs(await fetchText(sub))) live.add(url.replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "") || "/");
  } catch (error) {
    unreadable.push(`${sub}: ${error.message}`);
  }
}
if (unreadable.length > 0) throw new Error(`failed to read WordPress sub-sitemap: ${unreadable.join("; ")}`);
if (live.size === 0) throw new Error("no WordPress URLs parsed; refusing a vacuous drift check");

const raw = JSON.parse(readFileSync("content/legacy-urls.json", "utf8"));
const entries = Array.isArray(raw) ? raw : (raw.entries ?? raw.urls ?? Object.values(raw).find(Array.isArray));
const captured = new Set(entries.map((e) => String(e.from ?? e.source ?? e.url ?? e).replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "") || "/"));

const gaps = [...live].filter((path) => path !== "/" && !captured.has(path) && !coveredByPattern(path));

console.log(`\nlive urls        : ${live.size}`);
console.log(`captured         : ${captured.size}`);
console.log(`uncovered literals: ${gaps.length}`);

if (gaps.length === 0) {
  console.log("\nOK: every live url is either captured or covered by a pattern rule.");
  process.exitCode = 0;
} else {
  console.error("\nThese live urls have no redirect and would 404 on cutover:\n");
  for (const gap of gaps.sort()) console.error(`  ${gap}`);
  process.exitCode = 1;
}
