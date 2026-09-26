import {execFile} from "node:child_process";
import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {crossReferenceGsc, formatGscReport} from "@/scripts/gsc-cross-reference";

const sitemapXml = [
  "<urlset>",
  "  <url><loc>https://hkwtia.org/</loc></url>",
  "  <url><loc>https://hkwtia.org/zh</loc></url>",
  "  <url><loc>https://hkwtia.org/about/history/2024</loc></url>",
  "</urlset>",
].join("\n");

const input = {
  sitemapXml,
  coverageCsv: "URL,Last crawled\r\nhttps://hkwtia.org/about/history/2024,2026-09-20\r\nhttps://hkwtia.org/old-page,2026-09-19\r\n",
  queryCsv: "Top queries,Clicks,Impressions,CTR,Position\r\n\"wireless, Hong Kong\",12,120,10%,2.4\r\nAI,5,30,16.7%,4\r\n",
  linksCsv: "Target page,Internal links\r\nhttps://hkwtia.org/about/history/2024,3\r\nhttps://hkwtia.org/,20\r\n",
};

describe("Phase D-1 Search Console cross-reference", () => {
  it("joins exported indexing examples, queries, and links to the canonical sitemap", () => {
    const report = crossReferenceGsc(input);
    expect(report.sitemapUrlCount).toBe(3);
    expect(report.coverageSampleCount).toBe(2);
    expect(report.crawledNotIndexedInSitemap).toEqual([
      {url: "https://hkwtia.org/about/history/2024", exportedInternalLinks: 3},
    ]);
    expect(report.coverageOutsideSitemapCount).toBe(1);
    expect(report.topQueries).toEqual([
      {query: "wireless, Hong Kong", clicks: 12, impressions: 120},
      {query: "AI", clicks: 5, impressions: 30},
    ]);
    expect(report.sampledInternalLinks).toEqual([
      {url: "https://hkwtia.org/", count: 20},
      {url: "https://hkwtia.org/about/history/2024", count: 3},
    ]);
    expect(report.withoutLinkExportRowCount).toBe(1);
    expect(formatGscReport(report)).toContain("Absent export rows have unknown status");
  });

  it("fails closed on a pre-cutover sitemap and mixed sitemap origins", () => {
    expect(() => crossReferenceGsc({...input, sitemapXml: sitemapXml.replaceAll("hkwtia.org", "hkwtia.vercel.app")}))
      .toThrow("GSC_SITEMAP_WRONG_ORIGIN");
    expect(() => crossReferenceGsc({...input, sitemapXml: sitemapXml.replace("https://hkwtia.org/zh", "https://evil.example/zh")}))
      .toThrow("GSC_SITEMAP_WRONG_ORIGIN");
  });

  it("rejects missing columns, malformed CSV, and invalid link counts", () => {
    expect(() => crossReferenceGsc({...input, coverageCsv: "Other\nhttps://hkwtia.org/\n"}))
      .toThrow("GSC_COVERAGE_MISSING_COLUMN");
    expect(() => crossReferenceGsc({...input, queryCsv: 'Top queries,Clicks,Impressions\n"unfinished,1,2\n'}))
      .toThrow("GSC_CSV_UNCLOSED_QUOTE");
    expect(() => crossReferenceGsc({...input, linksCsv: "Target page,Internal links\nhttps://hkwtia.org/,many\n"}))
      .toThrow("GSC_LINKS_INVALID_COUNT");
  });

  it("prints a local Markdown report and fails if an export is missing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wtia-gsc-"));
    const paths = {
      sitemap: join(directory, "sitemap.xml"),
      coverage: join(directory, "coverage.csv"),
      queries: join(directory, "queries.csv"),
      links: join(directory, "links.csv"),
    };
    try {
      await Promise.all([
        writeFile(paths.sitemap, input.sitemapXml),
        writeFile(paths.coverage, input.coverageCsv),
        writeFile(paths.queries, input.queryCsv),
        writeFile(paths.links, input.linksCsv),
      ]);
      const run = (coverage: string) => new Promise<{error: Error | null; stdout: string; stderr: string}>((resolve) => {
        execFile(process.execPath, [
          "--import", "tsx", "scripts/gsc-cross-reference.ts",
          "--sitemap", paths.sitemap, "--coverage", coverage,
          "--queries", paths.queries, "--links", paths.links,
        ], {cwd: process.cwd()}, (error, stdout, stderr) => resolve({error, stdout, stderr}));
      });
      const success = await run(paths.coverage);
      expect(success.error).toBeNull();
      expect(success.stdout).toContain("## Internal links in supplied export");
      expect(success.stdout).toContain("https://hkwtia.org/about/history/2024");
      const missing = await run(join(directory, "missing.csv"));
      expect(missing.error).not.toBeNull();
      expect(missing.stderr).toContain("GSC_INPUT_READ_FAILED");
    } finally {
      await rm(directory, {recursive: true, force: true});
    }
  });
  it("does not let a quoted query forge Markdown sections", () => {
    const report = crossReferenceGsc({
      ...input,
      queryCsv: 'Top queries,Clicks,Impressions\n"phone\n## Forged section",2,20\n',
    });
    const markdown = formatGscReport(report);
    expect(markdown).toContain("- phone ## Forged section");
    expect(markdown).not.toContain("\n## Forged section");
  });

  it("rejects malformed grouped counts instead of silently changing their value", () => {
    expect(() => crossReferenceGsc({
      ...input,
      linksCsv: 'Target page,Internal links\nhttps://hkwtia.org/,"1,2"\n',
    })).toThrow("GSC_LINKS_INVALID_COUNT");
  });
});
