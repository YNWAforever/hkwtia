/**
 * `ArchiveToggleLabels.inUse` (components/admin/archive-toggle.tsx) is interpolated with a manual
 * `.replace("{count}", ...)` inside the toggle's own submit handler, not by next-intl -- so both
 * `Admin.media.archiveInUse` and `Admin.news.archiveInUse` must be read with `t.raw`, not `t`.
 * `t` parses ICU MessageFormat, and a literal `{count}` looks exactly like an ICU argument nobody
 * ever passed `values.count` to; next-intl's development build throws a `FORMATTING_ERROR` for it
 * and falls back to the bare message key ("Admin.media.archiveInUse" / "Admin.news.archiveInUse")
 * as the rendered warning -- production builds happen to leave the string untouched instead, which
 * is why this went unnoticed in `next build`, but that is an accident of next-intl's internal fast
 * path for a message no formatted (plural/select/number/date) construct shares with this bare
 * argument, not a documented contract.
 *
 * This lives outside components/admin/archive-toggle.tsx deliberately, mirroring
 * lib/i18n/mail-body.ts: that module is "use client", and both admin detail pages that build this
 * label (app/[locale]/(admin)/admin/media/[id]/page.tsx, .../admin/news/[id]/page.tsx) are Server
 * Components that would fail at request time importing a function from it.
 */
export const FALLBACK_ARCHIVE_IN_USE_MESSAGE = "{count}";

/** Guards the one contract `inUse` has with ArchiveToggle: a string containing `{count}`. */
export function toArchiveInUseMessage(value: unknown): string {
  return typeof value === "string" && value.includes("{count}") ? value : FALLBACK_ARCHIVE_IN_USE_MESSAGE;
}
