#!/usr/bin/env node
// Replays every classified legacy url against a running host and asserts each one reaches
// a real page. The unit test proves the redirect *rule* resolves; only this proves the
// destination answers. A redirect to a 404 is still a broken link, and these carry
// twenty-five years of citations.
//
// Usage: node scripts/verify-legacy-redirects.mjs [--host https://hkwtia.vercel.app] [--concurrency 6]

import {readFileSync} from "node:fs";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const host = (args.get("host") ?? "https://hkwtia.vercel.app").replace(/\/$/, "");
const concurrency = Number(args.get("concurrency") ?? 6);

const raw = JSON.parse(readFileSync("content/legacy-urls.json", "utf8"));
const entries = Array.isArray(raw) ? raw : (raw.entries ?? raw.urls ?? Object.values(raw).find(Array.isArray));
const paths = [...new Set(entries.map((e) => String(e.from ?? e.source ?? e.url ?? e)).map((u) => u.replace(/^https?:\/\/[^/]+/, "")))].filter((p) => p && p !== "/");

console.log(`Replaying ${paths.length} legacy paths against ${host} (concurrency ${concurrency})`);

const failures = [];
let done = 0;

// A dropped connection (`fetch failed`) says nothing about the destination -- it is a
// transport blip, and reporting it as a broken redirect is a false alarm. An HTTP answer
// is evidence, so it is never retried. Only a connection that keeps failing is recorded.
const MAX_TRANSPORT_ATTEMPTS = 3;

async function check(path) {
  for (let attempt = 1; attempt <= MAX_TRANSPORT_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${host}${path}`, {redirect: "follow", headers: {"user-agent": "wtia-cutover-verify"}});
      if (!response.ok) failures.push({path, status: response.status, landed: response.url});
      break;
    } catch (error) {
      if (attempt === MAX_TRANSPORT_ATTEMPTS) {
        failures.push({path, status: "ERROR", landed: String(error.message).slice(0, 80)});
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  if (++done % 50 === 0) console.log(`  ${done}/${paths.length}`);
}

const queue = [...paths];
await Promise.all(Array.from({length: concurrency}, async () => {
  for (let next = queue.pop(); next; next = queue.pop()) await check(next);
}));

if (failures.length === 0) {
  console.log(`\nOK: ${paths.length}/${paths.length} legacy paths reach a 200.`);
  process.exit(0);
}
console.error(`\nFAIL: ${failures.length} of ${paths.length} did not reach a 200:\n`);
for (const f of failures) console.error(`  ${f.status}  ${f.path}  ->  ${f.landed}`);
process.exit(1);
