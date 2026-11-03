/**
 * Exact demonstration slugs excluded from public reads. Not a title heuristic.
 * The M2 slugs are the fixtures in scripts/seed-m2.ts (`events` rows). Public
 * list, detail, sitemap and home latest-event reads skip them. The rows stay
 * in the database until an approved unpublish; this file does not write to it.
 */
export const AUDIT_DEMO_EVENT_SLUGS = [
  "wtia-global-growth-demo-briefing-2026",
  "m2-ai-showcase-briefing",
  "m2-launch-pad-workshop",
  "m2-ai-ops-open-lab",
  "m2-exco-roundtable",
] as const;

export function isAuditDemoEventSlug(slug: unknown): boolean {
  return typeof slug === "string" && (AUDIT_DEMO_EVENT_SLUGS as readonly string[]).includes(slug);
}
