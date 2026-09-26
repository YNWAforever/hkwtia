import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

export type GscInput = {
  sitemapXml: string;
  coverageCsv: string;
  queryCsv: string;
  linksCsv: string;
};

export type GscReport = {
  sitemapUrlCount: number;
  coverageSampleCount: number;
  crawledNotIndexedInSitemap: {url: string; exportedInternalLinks: number | null}[];
  coverageOutsideSitemapCount: number;
  topQueries: {query: string; clicks: number; impressions: number}[];
  sampledInternalLinks: {url: string; count: number}[];
  withoutLinkExportRowCount: number;
};

const CANONICAL_ORIGIN = "https://hkwtia.org";

function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;

  function finishField() {
    row.push(field);
    field = "";
    closedQuote = false;
  }
  function finishRow() {
    finishField();
    if (row.some((value) => value !== "")) rows.push(row);
    row = [];
  }

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
        closedQuote = true;
      } else {
        field += char;
      }
    } else if (char === ",") {
      finishField();
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      finishRow();
    } else if (char === '"' && field === "" && !closedQuote) {
      quoted = true;
    } else if (closedQuote) {
      throw new Error("GSC_CSV_INVALID_QUOTE");
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("GSC_CSV_UNCLOSED_QUOTE");
  if (field !== "" || row.length > 0 || closedQuote) finishRow();
  if (rows.length === 0) throw new Error("GSC_CSV_EMPTY");
  const width = rows[0].length;
  if (rows.some((item) => item.length !== width)) throw new Error("GSC_CSV_ROW_WIDTH");
  return rows;
}

function column(headers: string[], aliases: string[], source: string): number {
  const index = headers.findIndex((header) => aliases.includes(header.trim().toLowerCase()));
  if (index < 0) throw new Error("GSC_" + source + "_MISSING_COLUMN: " + aliases[0]);
  return index;
}

function count(value: string, source: string): number {
  const raw = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(raw)) throw new Error("GSC_" + source + "_INVALID_COUNT");
  const cleaned = raw.replaceAll(",", "");
  if (!/^\d+$/.test(cleaned)) throw new Error("GSC_" + source + "_INVALID_COUNT");
  const parsed = Number(cleaned);
  if (!Number.isSafeInteger(parsed)) throw new Error("GSC_" + source + "_INVALID_COUNT");
  return parsed;
}

function url(value: string, source: string): string {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    return parsed.href;
  } catch {
    throw new Error("GSC_" + source + "_INVALID_URL");
  }
}

function sitemapUrls(xml: string): Set<string> {
  if (!/<urlset\b/.test(xml) || !/<\/urlset>/.test(xml)) throw new Error("GSC_SITEMAP_INVALID");
  const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)];
  if (matches.length === 0) throw new Error("GSC_SITEMAP_EMPTY");
  const urls = new Set<string>();
  for (const match of matches) {
    const value = url(match[1].replaceAll("&amp;", "&"), "SITEMAP");
    if (new URL(value).origin !== CANONICAL_ORIGIN) throw new Error("GSC_SITEMAP_WRONG_ORIGIN");
    urls.add(value);
  }
  for (const pathname of ["/", "/zh"]) {
    if (![...urls].some((value) => new URL(value).pathname === pathname)) {
      throw new Error("GSC_SITEMAP_MISSING_LOCALE_ROOT");
    }
  }
  return urls;
}

export function crossReferenceGsc(input: GscInput): GscReport {
  const urls = sitemapUrls(input.sitemapXml);
  const [coverageHeaders, ...coverageRows] = parseCsv(input.coverageCsv);
  const coverageIndex = column(coverageHeaders, ["url", "page"], "COVERAGE");
  const [queryHeaders, ...queryRows] = parseCsv(input.queryCsv);
  const queryIndex = column(queryHeaders, ["top queries", "query"], "QUERIES");
  const clicksIndex = column(queryHeaders, ["clicks"], "QUERIES");
  const impressionsIndex = column(queryHeaders, ["impressions"], "QUERIES");
  const [linkHeaders, ...linkRows] = parseCsv(input.linksCsv);
  const linkUrlIndex = column(linkHeaders, ["target page", "page", "url"], "LINKS");
  const linkCountIndex = column(linkHeaders, ["internal links", "links"], "LINKS");

  const linksByUrl = new Map<string, number>();
  for (const row of linkRows) {
    const target = url(row[linkUrlIndex], "LINKS");
    if (linksByUrl.has(target)) throw new Error("GSC_LINKS_DUPLICATE_URL");
    linksByUrl.set(target, count(row[linkCountIndex], "LINKS"));
  }
  const covered = new Set(coverageRows.map((row) => url(row[coverageIndex], "COVERAGE")));
  const inSitemap = [...covered].filter((value) => urls.has(value)).sort();
  const topQueries = queryRows.map((row) => ({
    query: row[queryIndex].trim(),
    clicks: count(row[clicksIndex], "QUERIES"),
    impressions: count(row[impressionsIndex], "QUERIES"),
  })).sort((left, right) => right.clicks - left.clicks || left.query.localeCompare(right.query));

  return {
    sitemapUrlCount: urls.size,
    coverageSampleCount: covered.size,
    crawledNotIndexedInSitemap: inSitemap.map((value) => ({
      url: value,
      exportedInternalLinks: linksByUrl.get(value) ?? null,
    })),
    coverageOutsideSitemapCount: covered.size - inSitemap.length,
    topQueries,
    sampledInternalLinks: [...linksByUrl].filter(([value]) => urls.has(value)).map(([value, links]) => ({url: value, count: links})).sort((left, right) => right.count - left.count || left.url.localeCompare(right.url)),
    withoutLinkExportRowCount: [...urls].filter((value) => !linksByUrl.has(value)).length,
  };
}

export function formatGscReport(report: GscReport): string {
  const lines = [
    "# WTIA Search Console cross-reference",
    "",
    "Canonical sitemap URLs: " + report.sitemapUrlCount,
    "Exported crawled-not-indexed examples: " + report.coverageSampleCount,
    "Examples in sitemap: " + report.crawledNotIndexedInSitemap.length,
    "Examples outside sitemap: " + report.coverageOutsideSitemapCount,
    "Sitemap URLs absent from Internal links export: " + report.withoutLinkExportRowCount + " (unknown link count)",
    "",
    "## Crawled-not-indexed examples in sitemap",
    "",
    ...report.crawledNotIndexedInSitemap.map((item) =>
      "- " + item.url + " — exported internal links: " + (item.exportedInternalLinks ?? "unknown")),
    "",
    "## Internal links in supplied export",
    "",
    ...report.sampledInternalLinks.map((item) => "- " + item.url + " — " + item.count + " links"),
    "",
    "## Top queries in supplied export",
    "",
    ...report.topQueries.map((item) =>
      "- " + item.query.replace(/[\r\n\t]+/g, " ").trim() + " — " + item.clicks + " clicks, " + item.impressions + " impressions"),
    "",
    "Page Indexing and Internal links exports are samples. Absent export rows have unknown status and unknown link count.",
  ];
  return lines.join("\n") + "\n";
}

function parseCliArgs(argv: string[]) {
  const required = ["sitemap", "coverage", "queries", "links"] as const;
  const paths = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || !required.includes(name.slice(2) as typeof required[number]) ||
        !value || value.startsWith("--") || paths.has(name.slice(2))) {
      throw new Error("GSC_INVALID_ARGUMENTS");
    }
    paths.set(name.slice(2), value);
  }
  for (const name of required) {
    if (!paths.has(name)) throw new Error("GSC_MISSING_ARGUMENT: " + name);
  }
  return paths;
}

export async function runGscCli(argv: string[]): Promise<string> {
  const paths = parseCliArgs(argv);
  let texts: string[];
  try {
    texts = await Promise.all(["sitemap", "coverage", "queries", "links"]
      .map((name) => readFile(paths.get(name)!, "utf8")));
  } catch {
    throw new Error("GSC_INPUT_READ_FAILED");
  }
  const [sitemapXml, coverageCsv, queryCsv, linksCsv] = texts;
  return formatGscReport(crossReferenceGsc({sitemapXml, coverageCsv, queryCsv, linksCsv}));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    process.stdout.write(await runGscCli(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "GSC_REPORT_FAILED");
    process.exitCode = 1;
  }
}
