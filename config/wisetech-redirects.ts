import {wisetechIntegrationManifest} from "./wisetech-integration-manifest";

/**
 * Real redirects for every route the integration manifest classifies as `merge`: the donor
 * design's own paths (and the chatgpt.site sitemap that still lists them) resolve on this domain
 * instead of 404ing. Generated from the manifest so a disposition change can never leave a stale
 * rule behind. Design: docs/superpowers/specs/2026-09-06-wisetech-wp7-routes-seo-design.md §4.1.
 *
 * Three sources per rule (D-6): the donor served `/en/*` and `/zh/*`. `/zh/<x>` must be matched
 * here because the next-intl proxy would otherwise rewrite it to a `zh-HK` page that does not
 * exist; `/en/<x>` is matched so the rule fires before the proxy rather than depending on the
 * proxy's default-locale strip. `permanent: false` (D-5): these are design paths, not the
 * hkwtia.org legacy urls in content/legacy-urls.json, which keep their 308s.
 */
export type WisetechRedirect = Readonly<{source: string; destination: string; permanent: false}>;

const localePrefixes = [
  {source: "", destination: ""},
  {source: "/en", destination: ""},
  {source: "/zh", destination: "/zh"},
] as const;

function toNextPattern(path: string): string {
  return path.replace(/\[([^/\]]+)\]/g, ":$1");
}

function paramNames(pattern: string): ReadonlySet<string> {
  return new Set([...pattern.matchAll(/:([^/]+)/g)].map((match) => match[1]!));
}

/** `/members/:id` and `/members/[slug]` are the same shape; explicit rules win (D-8). */
function shape(path: string): string {
  return toNextPattern(path).replace(/:[^/]+/g, ":p");
}

/** Cut the destination at the first param the source cannot supply (D-7). */
function resolveDestination(source: string, canonicalPath: string): string {
  const supplied = paramNames(source);
  const segments = toNextPattern(canonicalPath).split("/");
  const cut = segments.findIndex((segment) => segment.startsWith(":") && !supplied.has(segment.slice(1)));
  const kept = cut === -1 ? segments : segments.slice(0, cut);
  const joined = kept.join("/");
  return joined === "" ? "/" : joined;
}

function prefixed(prefix: string, path: string): string {
  return path === "/" ? (prefix === "" ? "/" : prefix) : `${prefix}${path}`;
}

export function wisetechDesignRedirects(explicitSources: readonly string[]): readonly WisetechRedirect[] {
  const explicit = new Set(explicitSources.map(shape));
  const rules: WisetechRedirect[] = [];

  for (const entry of wisetechIntegrationManifest) {
    if (entry.kind !== "route" || entry.disposition !== "merge" || !entry.source.startsWith("/")) continue;
    if (typeof entry.canonicalPath !== "string") {
      // A merge without a destination is a manifest bug: fail the build, never drop the rule.
      throw new Error(`WISETECH_REDIRECT_MISSING_CANONICAL:${entry.id}`);
    }
    const source = toNextPattern(entry.source);
    if (shape(source) === shape(entry.canonicalPath)) continue;
    if (explicit.has(shape(source))) continue;
    const destination = resolveDestination(source, entry.canonicalPath);
    if (destination === source) continue;
    for (const prefix of localePrefixes) {
      rules.push({
        source: prefixed(prefix.source, source),
        destination: prefixed(prefix.destination, destination),
        permanent: false,
      });
    }
  }

  rules.sort((a, b) => a.source.localeCompare(b.source));
  return Object.freeze(rules.map((rule) => Object.freeze(rule)));
}
