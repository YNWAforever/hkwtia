/**
 * The wa.me deep link that opens WhatsApp with a drafted message to a number.
 * Pure and dependency-free so the client panel can build it without importing
 * the server-only core. wa.me wants the number as digits alone (no `+`, no
 * spaces), and the text percent-encoded.
 */
export function whatsappInviteHref(phoneE164: string, text: string): string {
  return `https://wa.me/${phoneE164.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
