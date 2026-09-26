/**
 * Exact historical demonstration event identified in the 2026-09-26 audit.
 * This registry is an explicit content marker, not a title/substring heuristic.
 * Additions require a reviewed ID/slug manifest and proof of related orders.
 */
export const AUDIT_DEMO_EVENT_SLUGS = ["wtia-global-growth-demo-briefing-2026"] as const;

export function isAuditDemoEventSlug(slug: unknown): boolean {
  return typeof slug === "string" && (AUDIT_DEMO_EVENT_SLUGS as readonly string[]).includes(slug);
}
