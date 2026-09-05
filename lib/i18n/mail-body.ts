/**
 * Shared guard for `FooterNewsletterLabels.mailBody` (components/layout/footer-newsletter.tsx),
 * built by every Server Component that assembles those labels: `SiteFooter`
 * (components/layout/site-footer.tsx) and the News subscribe band
 * (app/[locale]/(public)/news/page.tsx).
 *
 * Every caller reads the message with `t.raw(key)`, not `t(key)`: next-intl's `t()` parses ICU
 * MessageFormat, and a literal `{email}` in the message looks exactly like an ICU argument, so
 * `t()` throws a `FORMATTING_ERROR` for a value nobody ever passed `values.email` to. `t.raw`
 * returns the bundle string untouched, but untouched means untyped -- a missing or reshaped key
 * hands `toMailBody` an `undefined`, an object, or a string with no placeholder at all, and
 * FooterNewsletter's `mailBody.replace("{email}", ...)` only runs inside its submit handler, so a
 * bad shape does not 500 the render. It costs the reader the handoff instead: no mail client
 * opens, and the address they typed is gone. The fallback is the placeholder alone, so a degraded
 * draft still carries the reader's address and nothing else -- any prose here would need a
 * message of its own in both bundles, and a bundle defect is exactly the situation where reaching
 * for another message is least likely to work.
 *
 * This lives outside components/layout/footer-newsletter.tsx deliberately: that module is
 * `"use client"`, and Next.js turns every one of its exports -- plain functions included -- into
 * a client reference. A Server Component calling `toMailBody` imported from there fails at
 * request time with "Attempted to call toMailBody() from the server but toMailBody is on the
 * client", a failure vitest's module graph does not reproduce because it does not enforce the
 * RSC boundary the way `next dev`/`next build` do.
 */
export const FALLBACK_MAIL_BODY = "{email}";

/** Guards the one contract `mailBody` has with FooterNewsletter: a string containing `{email}`. */
export function toMailBody(value: unknown): string {
  return typeof value === "string" && value.includes("{email}") ? value : FALLBACK_MAIL_BODY;
}
