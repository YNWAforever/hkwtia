// Plain data module: no "use client" directive and no React import. Next.js's RSC client-boundary
// serialization only supports importing actual components (and other function values) across a
// "use client" boundary -- a plain array/type/guard exported from a client module comes through
// broken when a Server Component imports it directly (see the incident this module fixes,
// AGENTS.md M4-era regression notes on /contact 500ing). Keeping these here lets both the Server
// Component page (app/[locale]/(public)/contact/page.tsx) and the Client Component form
// (components/marketing/prepared-email-form.tsx) import the same constants safely.
export const CONTACT_TOPICS = ["portal", "membership", "events", "programmes", "partnership", "privacy", "media"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export function isContactTopic(value: string): value is ContactTopic {
  return (CONTACT_TOPICS as readonly string[]).includes(value);
}
