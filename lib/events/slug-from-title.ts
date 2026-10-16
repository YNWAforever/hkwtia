const MAX_LENGTH = 80;

/**
 * Suggests an event page address from its English title, for the new-event form.
 *
 * NFKD splits accented letters into letter + combining mark (é → e + ◌́) and folds full-width
 * forms (１２３ → 123), so dropping the marks keeps "Café" as "cafe" instead of "caf". Anything
 * else outside `[a-z0-9]` becomes a hyphen. A title with no ASCII letters or digits ("人工智能論壇")
 * returns "" so the member fills the address in, never "-" (plan Review Focus 1). The 80-character
 * cap cuts back to the last whole word so the address never ends mid-word or on a hyphen. The
 * result always matches the form's `[a-z0-9]+(?:-[a-z0-9]+)*` pattern, or is empty.
 */
export function slugFromTitle(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= MAX_LENGTH) return slug;
  const cut = slug.slice(0, MAX_LENGTH);
  if (slug[MAX_LENGTH] === "-") return cut;
  const lastHyphen = cut.lastIndexOf("-");
  return lastHyphen > 0 ? cut.slice(0, lastHyphen) : cut;
}
