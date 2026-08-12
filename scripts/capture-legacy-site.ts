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

/**
 * WordPress's sitemap_index.xml lists other sitemaps, not pages — Yoast splits post
 * types (events, FAQs, categories) into their own files. A one-level-deep capture
 * silently drops all of that, so this follows every nested <loc> that ends in .xml.
 * Nesting isn't bounded by the caller, so `visitedSitemaps` is the actual termination
 * guard: a sitemap that lists itself (or a cycle) is fetched at most once.
 */
export async function collectPageUrls(
  sitemapUrls: string[],
  fetchText: (url: string) => Promise<string | null>,
  onSitemapFetched?: (url: string, xml: string | null) => void | Promise<void>,
): Promise<string[]> {
  const visitedSitemaps = new Set<string>();
  const pageUrls = new Set<string>();
  const queue = [...sitemapUrls];

  for (let sitemapUrl = queue.shift(); sitemapUrl !== undefined; sitemapUrl = queue.shift()) {
    if (visitedSitemaps.has(sitemapUrl)) continue;
    visitedSitemaps.add(sitemapUrl);

    const xml = await fetchText(sitemapUrl);
    await onSitemapFetched?.(sitemapUrl, xml);
    if (!xml) continue;

    for (const url of parseSitemapUrls(xml)) {
      if (url.endsWith(".xml")) {
        if (!visitedSitemaps.has(url)) queue.push(url);
      } else {
        pageUrls.add(url);
      }
    }
  }

  return [...pageUrls];
}

/**
 * Kept separate from the fetch loop so capturedUrls can only ever contain urls this
 * function actually wrote a body for — folding a failed fetch into "captured" is the
 * bug Task 8 would silently inherit when it builds the redirect map from inventory.json.
 */
export async function capturePages(
  pageUrls: string[],
  fetchText: (url: string) => Promise<string | null>,
  onPageFetched: (url: string, body: string) => void | Promise<void>,
): Promise<{captured: string[]; missed: string[]}> {
  const captured: string[] = [];
  const missed: string[] = [];

  for (const url of pageUrls) {
    const body = await fetchText(url);
    if (!body) {
      missed.push(url);
      continue;
    }
    await onPageFetched(url, body);
    captured.push(url);
  }

  return {captured, missed};
}

async function main(): Promise<void> {
  await mkdir(join(OUTPUT_DIR, "pages"), {recursive: true});

  const pageUrls = await collectPageUrls(
    SITEMAPS.map((path) => `${ORIGIN}${path}`),
    fetchText,
    async (url, xml) => {
      if (!xml) {
        console.error(`MISSED sitemap ${url}`);
        return;
      }
      await writeFile(join(OUTPUT_DIR, `${slugify(url)}.xml`), xml);
    },
  );

  const {captured, missed} = await capturePages(pageUrls, fetchText, async (url, body) => {
    await writeFile(join(OUTPUT_DIR, "pages", `${slugify(url)}.html`), body);
  });

  await writeFile(
    join(OUTPUT_DIR, "inventory.json"),
    `${JSON.stringify({capturedUrls: captured.sort(), missed}, null, 2)}\n`,
  );
  console.log(`captured ${captured.length}/${pageUrls.length} urls; ${missed.length} missed`);
}

if (process.argv[1]?.endsWith("capture-legacy-site.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Legacy capture failed.");
    process.exitCode = 1;
  });
}
