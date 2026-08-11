import {mkdir, writeFile} from "node:fs/promises";
import {join} from "node:path";

const ORIGIN = "https://hkwtia.org";
const SITEMAPS = ["/post-sitemap.xml", "/page-sitemap.xml", "/sitemap_index.xml"];
const OUTPUT_DIR = ".legacy-capture";

export function parseSitemapUrls(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(([, url]) => url);
}

/**
 * hkwtia.org returns intermittent Cloudflare 520s. A single failure must not
 * abandon the capture, and a permanent failure must not abort the whole run —
 * a partial inventory is still worth having, and the caller records the gap.
 */
export async function retryable<T>(
  operation: () => Promise<T>,
  {attempts, delayMs}: {attempts: number; delayMs: number},
): Promise<T | null> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch {
      if (attempt === attempts) return null;
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return null;
}

function slugify(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function fetchText(url: string): Promise<string | null> {
  return retryable(async () => {
    const response = await fetch(url, {headers: {"user-agent": "wtia-migration-capture"}});
    if (!response.ok) throw new Error(`${response.status}`);
    return response.text();
  }, {attempts: 5, delayMs: 2_000});
}

async function main(): Promise<void> {
  await mkdir(join(OUTPUT_DIR, "pages"), {recursive: true});

  const urls = new Set<string>();
  for (const path of SITEMAPS) {
    const xml = await fetchText(`${ORIGIN}${path}`);
    if (!xml) {
      console.error(`MISSED sitemap ${path}`);
      continue;
    }
    await writeFile(join(OUTPUT_DIR, `${slugify(path)}.xml`), xml);
    for (const url of parseSitemapUrls(xml)) urls.add(url);
  }

  const missed: string[] = [];
  for (const url of urls) {
    if (url.endsWith(".xml")) continue;
    const body = await fetchText(url);
    if (!body) {
      missed.push(url);
      continue;
    }
    await writeFile(join(OUTPUT_DIR, "pages", `${slugify(url)}.html`), body);
  }

  await writeFile(
    join(OUTPUT_DIR, "inventory.json"),
    `${JSON.stringify({capturedUrls: [...urls].sort(), missed}, null, 2)}\n`,
  );
  console.log(`captured ${urls.size - missed.length}/${urls.size} urls; ${missed.length} missed`);
}

if (process.argv[1]?.endsWith("capture-legacy-site.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Legacy capture failed.");
    process.exitCode = 1;
  });
}
