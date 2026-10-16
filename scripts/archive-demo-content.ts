/**
 * Exact audited event only. Defaults to read-only inventory; mutation requires
 * an operator-approved UUID from that inventory. The older showcase/news
 * one-shot already ran in September and is intentionally never replayed here.
 *
 * DEMO_EVENT_ARCHIVE_MODE=dry-run DATABASE_URL=... npm run content:archive-demo
 * DEMO_EVENT_ARCHIVE_MODE=unpublish DEMO_EVENT_APPROVED_IDS=<uuid> DATABASE_URL=... npm run content:archive-demo
 * DEMO_EVENT_ARCHIVE_MODE=restore DEMO_EVENT_APPROVED_IDS=<uuid> DATABASE_URL=... npm run content:archive-demo
 */
import {neon} from "@neondatabase/serverless";

import {AUDIT_DEMO_EVENT_SLUGS} from "../config/demo-events.ts";
import {parseDemoArchiveOptions} from "./lib/demo-archive-options.ts";

const options = parseDemoArchiveOptions({
  mode: process.env.DEMO_EVENT_ARCHIVE_MODE,
  approvedIds: process.env.DEMO_EVENT_APPROVED_IDS,
});
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_REQUIRED");
const sql = neon(url);

type EventRow = Readonly<{id: string; slug: string; status: string; published: boolean; published_at: Date | null}>;
type Related = Readonly<{member_registration_ids: string[]; guest_registration_ids: string[]; order_ids: string[]}>;

async function relatedFor(id: string): Promise<Related> {
  const rows = await sql`
    SELECT
      ARRAY(SELECT profile_id FROM event_registrations WHERE event_id = ${id}::uuid ORDER BY profile_id) AS member_registration_ids,
      ARRAY(SELECT id::text FROM event_guest_registrations WHERE event_id = ${id}::uuid ORDER BY id) AS guest_registration_ids,
      ARRAY(SELECT id::text FROM event_orders WHERE event_id = ${id}::uuid ORDER BY id) AS order_ids
  `;
  return rows[0] as Related;
}

const candidates: EventRow[] = [];
for (const slug of AUDIT_DEMO_EVENT_SLUGS) {
  const rows = await sql`SELECT id, slug, status, published, published_at FROM events WHERE slug = ${slug}`;
  candidates.push(...rows as EventRow[]);
}
const ids = new Set(candidates.map((row) => row.id));
if (options.mode !== "dry-run" && options.approvedIds.some((id) => !ids.has(id))) {
  throw new Error("DEMO_APPROVED_ID_NOT_IN_EXACT_REGISTRY");
}

const inventory = [];
for (const row of candidates) {
  const related = await relatedFor(row.id);
  inventory.push({
    before: row,
    related,
    proposed: options.mode === "unpublish" ? {status: "draft", published: false}
      : options.mode === "restore" ? {status: "published", published: true} : null,
    requiresReview: related.member_registration_ids.length > 0 || related.guest_registration_ids.length > 0 || related.order_ids.length > 0,
  });
}
if (options.mode === "dry-run") {
  console.log(JSON.stringify({mode: options.mode, inventory}));
} else {
  // Relations change the cancellation/refund/notification story. A separate
  // association decision is required before any such row is changed.
  const selected = inventory.filter((entry) => options.approvedIds.includes(entry.before.id));
  if (selected.some((entry) => entry.requiresReview)) throw new Error("DEMO_EVENT_HAS_RELATED_RECORDS");
  const changes = [];
  for (const entry of selected) {
    const id = entry.before.id;
    const slug = entry.before.slug;
    const after = options.mode === "unpublish"
      ? await sql`UPDATE events SET status = 'draft', published = false, updated_at = now()
          WHERE id = ${id}::uuid AND slug = ${slug} AND status = 'published' AND published = true
            AND NOT EXISTS (SELECT 1 FROM event_registrations WHERE event_id = ${id}::uuid)
            AND NOT EXISTS (SELECT 1 FROM event_guest_registrations WHERE event_id = ${id}::uuid)
            AND NOT EXISTS (SELECT 1 FROM event_orders WHERE event_id = ${id}::uuid)
          RETURNING id, slug, status, published, published_at`
      : await sql`UPDATE events SET status = 'published', published = true, updated_at = now()
          WHERE id = ${id}::uuid AND slug = ${slug} AND status = 'draft' AND published = false
            AND NOT EXISTS (SELECT 1 FROM event_registrations WHERE event_id = ${id}::uuid)
            AND NOT EXISTS (SELECT 1 FROM event_guest_registrations WHERE event_id = ${id}::uuid)
            AND NOT EXISTS (SELECT 1 FROM event_orders WHERE event_id = ${id}::uuid)
          RETURNING id, slug, status, published, published_at`;
    changes.push({id, before: entry.before, after: after[0] ?? null});
  }
  console.log(JSON.stringify({mode: options.mode, changes}));
  if (changes.some((change) => change.after === null)) throw new Error("DEMO_ARCHIVE_STATE_CHANGED_REVIEW_OUTPUT");
}
