/**
 * wa.me deep link. The bracketed marker at the end of `text` (e.g.
 * "[web:contact:en]") survives into the first inbound message, so the Phase C
 * inbox can attribute the lead to the page that produced it without any
 * tracking script.
 */
export function clickToChatUrl(input: Readonly<{number: string | undefined; text: string}>): string | null {
  if (!input.number) return null;
  const digits = input.number.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(input.text)}`;
}
