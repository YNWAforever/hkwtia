/** Full-width punctuation that already carries its own trailing space in Chinese typography. */
const FULL_WIDTH_END = /[。！？；：，、」』）】]$/;

/**
 * The gap to render between two translated sentences shown side by side: a space after Latin
 * text, nothing after full-width punctuation. Joining with a literal `{" "}` put a visible
 * 「。 」 gap into the Chinese pages (round 19: /zh/partners and the programme winners line).
 * Decided from the text rather than the locale, so components need not be handed one.
 */
export function sentenceGap(previous: string): string {
  const text = previous.trimEnd();
  if (!text) return "";
  return FULL_WIDTH_END.test(text) ? "" : " ";
}
