// Archives the fictional showcase listings and news post that shipped as
// public-journey demos (audit F14, programme D-13). Guarded: requires an explicit
// flag and a DATABASE_URL, mirroring scripts/seed-m6.ts's opt-in shape. Nothing is
// deleted: listings go to `rejected` with a dated reason, the post gains archived_at.
//
//   ARCHIVE_DEMO_CONTENT=preview DATABASE_URL=… npm run content:archive-demo   # list only
//   ARCHIVE_DEMO_CONTENT=true    DATABASE_URL=… npm run content:archive-demo   # apply
import {neon} from "@neondatabase/serverless";

const flag = process.env.ARCHIVE_DEMO_CONTENT;
const url = process.env.DATABASE_URL;
if ((flag !== "true" && flag !== "preview") || !url) {
  console.error("Set ARCHIVE_DEMO_CONTENT=true (or =preview) and DATABASE_URL to run.");
  process.exit(1);
}
const sql = neon(url);
const DEMO_POST_SLUG = "wtia-demo-content-note-2026";

if (flag === "preview") {
  const listings = await sql`SELECT slug, status FROM showcase_listings WHERE slug LIKE '%-demo' ORDER BY slug`;
  const posts = await sql`SELECT slug, archived_at FROM posts WHERE slug = ${DEMO_POST_SLUG}`;
  console.log(JSON.stringify({preview: true, listings, posts}));
} else {
  const listings = await sql`UPDATE showcase_listings SET status = 'rejected', rejection_reason = 'demo content archived 2026-09', reviewed_at = now(), updated_at = now() WHERE slug LIKE '%-demo' AND status = 'published' RETURNING slug`;
  const posts = await sql`UPDATE posts SET archived_at = now(), updated_at = now() WHERE slug = ${DEMO_POST_SLUG} AND archived_at IS NULL RETURNING slug`;
  console.log(JSON.stringify({archivedListings: listings.map((row) => row.slug), archivedPosts: posts.map((row) => row.slug)}));
}
