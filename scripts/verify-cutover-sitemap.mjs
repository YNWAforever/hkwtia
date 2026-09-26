#!/usr/bin/env node
// Verify the live sitemap after the domain cutover, including the preview alias redirect.
// Usage: node scripts/verify-cutover-sitemap.mjs --host https://hkwtia.org --canonical https://hkwtia.org [--expect-redirect]

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  if (!process.argv[i].startsWith("--")) throw new Error(`unexpected argument: ${process.argv[i]}`);
  const name = process.argv[i].slice(2);
  if (name === "expect-redirect") args.set(name, true);
  else args.set(name, process.argv[++i]);
}
if (!args.get("host") || !args.get("canonical")) throw new Error("--host and --canonical are required");
const host = new URL(args.get("host")).origin;
const canonical = new URL(args.get("canonical")).origin;
const sitemapPath = "/sitemap.xml";
const response = await fetch(`${host}${sitemapPath}`, {redirect: "manual"});
let sitemapResponse = response;
if (args.get("expect-redirect")) {
  if (response.status !== 308) throw new Error(`expected 308 from ${host}, got ${response.status}`);
  const location = new URL(response.headers.get("location") ?? "", host).href;
  if (location !== `${canonical}${sitemapPath}`) throw new Error(`unexpected sitemap redirect: ${location}`);
  sitemapResponse = await fetch(location, {redirect: "manual"});
}
if (sitemapResponse.status !== 200) throw new Error(`expected sitemap 200, got ${sitemapResponse.status}`);
const xml = await sitemapResponse.text();
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
if (urls.length === 0) throw new Error("sitemap has no <loc> entries");
for (const value of urls) {
  if (new URL(value).origin !== canonical) throw new Error(`sitemap <loc> has wrong origin: ${value}`);
}
for (const locale of ["/", "/zh"]) {
  if (!urls.some((value) => new URL(value).pathname === locale)) throw new Error(`sitemap lacks ${locale}`);
}
const alternates = [...xml.matchAll(/\bhref="([^"]+)"/g)].map((match) => match[1]);
for (const value of alternates) {
  if (new URL(value).origin !== canonical) throw new Error(`sitemap alternate has wrong origin: ${value}`);
}
console.log(`OK: ${urls.length} sitemap URLs and ${alternates.length} alternates use ${canonical}`);
