import {readdirSync, readFileSync} from "node:fs";
import {join, relative, resolve} from "node:path";
import {describe, expect, it} from "vitest";

function componentFiles(directory: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return componentFiles(path);
    return entry.isFile() && path.endsWith(".tsx") ? [path] : [];
  });
}

const sources = ["app", "components"]
  .flatMap((root) => componentFiles(resolve(process.cwd(), root)))
  .map((path) => relative(process.cwd(), path).replaceAll("\\", "/"))
  .sort();

describe("image render policy", () => {
  it("discovers the component tree", () => {
    expect(sources.length).toBeGreaterThan(50);
    expect(sources).toContain("components/marketing/showcase-card.tsx");
    expect(sources).toContain("components/admin/media-form.tsx");
  });

  // Both counts are zero today. The point is that they stay zero: `unoptimized`
  // and a raw <img> are the two escape hatches a developer reaches for within
  // minutes of hitting the own-origin restriction, and both work mechanically —
  // they skip the loader entirely and move the fetch into the visitor's
  // browser, leaking their IP and referer to whatever host is in the src.
  it.each(sources)("%s uses neither a raw img tag nor unoptimized", (path) => {
    const source = readFileSync(resolve(process.cwd(), path), "utf8");

    expect(source).not.toMatch(/<img[\s/>]/);
    expect(source).not.toContain("unoptimized");
  });
});

/**
 * The config documents why each of these is absent, so matching raw file text
 * would match the explanation rather than the code. Strip comments first.
 */
function withoutComments(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/\/\/[^\n]*/g, "");
}

describe("next.config.ts image posture", () => {
  const config = withoutComments(
    readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8"),
  );

  it.each([
    ["a remote image host allowlist", "remotePatterns"],
    ["a domains allowlist", "images: {"],
    ["SVG rendering through the optimizer", "dangerouslyAllowSVG"],
    ["a loosened content disposition", "contentDispositionType"],
  ])("configures no %s", (_case, forbidden) => {
    expect(config).not.toContain(forbidden);
  });

  it("restricts images to this origin at the browser", () => {
    expect(config).toContain("Content-Security-Policy");
    expect(config).toContain("img-src 'self' data:");
    // No default-src, so this policy cannot break scripts or styles.
    expect(config).not.toContain("default-src");
  });
});
