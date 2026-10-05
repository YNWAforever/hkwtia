// The milestone archive was migrated from WordPress, and eight bodies kept their
// `[pdf-embedder url=”/wp-content/uploads/…”]` shortcodes -- which /about/history then printed
// verbatim, and whose unbreakable URL tokens pushed the 2020 entries past a 320px screen. The
// PDFs they named are not hosted on this site, so there is nothing a reader can open: the
// shortcode is removed at render time, never rewritten into a link that would 404. The record in
// content/milestones.ts is left as captured, because it is the migration's evidence.
const PDF_EMBEDDER_SHORTCODE = /\[pdf-embedder\b[^\]]*\]/g;

/** Paragraphs of a milestone body as a reader should see them. */
export function readableMilestoneBody(body: string): string[] {
  return body
    .replace(PDF_EMBEDDER_SHORTCODE, "")
    .split("\n\n")
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "");
}
