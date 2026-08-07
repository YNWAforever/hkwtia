import type {AppLocale} from "@/i18n/routing";

/**
 * Locale-correct separators for `label: value` pairs.
 *
 * Chinese takes the full-width colon `：`, which already carries its own
 * trailing whitespace — so the ASCII space that follows an English colon is
 * wrong there too, not just the glyph. Eight call sites hard-coded `:` and
 * rendered `會員: 1` on the Chinese pages; `docs/i18n-glossary.md` had the rule
 * and nothing enforced it, because `scripts/audit-visible-strings.mjs` waved
 * through any JSX text made only of punctuation.
 *
 * Membership is an explicit set rather than `locale !== "en"` so that adding a
 * locale is a decision here, not a silent inheritance of CJK punctuation.
 */
const fullWidthPunctuationLocales: ReadonlySet<AppLocale> = new Set<AppLocale>(["zh-HK"]);

/**
 * The separator alone, for JSX where the label and the value are separate
 * nodes. Includes the trailing space in English; the full-width colon needs
 * none.
 */
export function labelSeparator(locale: AppLocale): string {
  return fullWidthPunctuationLocales.has(locale) ? "：" : ": ";
}

/** The joined string, for `aria-label`s and status messages. */
export function labelledValue(locale: AppLocale, label: string, value: string): string {
  return `${label}${labelSeparator(locale)}${value}`;
}
