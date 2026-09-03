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

const revocationAwareConsumers = new Set([
  "app/[locale]/(admin)/admin/media/page.tsx",
  "components/admin/media-form.tsx",
  "components/admin/showcase-review-table.tsx",
  "components/home/legacy-network.tsx",
  "components/marketing/event-detail.tsx",
  "components/marketing/home-highlight-card.tsx",
  "components/marketing/home-partner-wall.tsx",
  "components/marketing/showcase-card.tsx",
  "components/marketing/showcase-detail.tsx",
]);

describe("image render policy", () => {
  it("discovers the component tree", () => {
    expect(sources.length).toBeGreaterThan(50);
    expect(sources).toContain("components/marketing/showcase-card.tsx");
    expect(sources).toContain("components/admin/media-form.tsx");
  });

  // Raw images remain forbidden. The only optimizer bypass is the exact,
  // conditional own-origin delivery path whose per-request database check makes
  // archive revocation effective.
  it.each(sources)("%s uses no raw img and only the authorized optimizer bypass", (path) => {
    const source = readFileSync(resolve(process.cwd(), path), "utf8");

    expect(source).not.toMatch(/<img[\s/>]/);
    if (revocationAwareConsumers.has(path)) {
      expect(source).toMatch(/from ['"]@\/lib\/media\/url['"]/);
      expect(source).toContain("unoptimized={isPrivateMediaDeliveryUrl(");
    } else {
      expect(source).not.toContain("unoptimized");
    }
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

  it.each([
    ["images to this origin", "img-src 'self' data:"],
    ["framing, which is what makes admin clickjacking possible", "frame-ancestors 'none'"],
    ["base-tag injection repointing relative script URLs", "base-uri 'self'"],
    ["plugin content", "object-src 'none'"],
    ["cross-origin form posts", "form-action 'self'"],
  ])("restricts %s at the browser", (_case, directive) => {
    expect(config).toContain("Content-Security-Policy");
    expect(config).toContain(directive);
  });

  it.each([
    ["X-Frame-Options", "DENY"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["X-Content-Type-Options", "nosniff"],
    ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
  ])("sends %s", (header, value) => {
    expect(config).toContain(header);
    expect(config).toContain(value);
  });

  // The negative half is what stops a well-meaning contributor adding a
  // directive that white-screens the site, or an HSTS preload that browsers
  // cache for two years and a redeploy cannot undo.
  it.each([
    ["default-src", "would make every unnamed directive restrictive at once"],
    ["script-src", "needs a per-request nonce; staged separately, report-only first"],
    ["Strict-Transport-Security", "Vercel already sends it, and preload outlives a mistake"],
  ])("still declares no %s — %s", (forbidden) => {
    expect(config).not.toContain(forbidden);
  });
});
