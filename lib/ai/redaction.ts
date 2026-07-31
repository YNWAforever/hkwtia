const MAX_OPERATIONAL_SUMMARY_LENGTH = 240;
const TRUNCATION_MARKER = "[TRUNCATED]";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const TOKEN_PATTERN =
  /\b(?:bearer\s+|access[_-]?token\s*[:=]\s*|api[_-]?key\s*[:=]\s*)[A-Z0-9._~+/-]{8,}/gi;
const MEMBER_ID_PATTERN =
  /\b(?:member(?:ship)?\s*(?:id|number|no\.?)|WTIA)[\s:#-]*[A-Z0-9][A-Z0-9-]{5,}\b/gi;
const PHONE_PATTERN = /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?){2,4}\d{2,4}/g;

export function redactAgentSummary(summary: string): string {
  const redacted = summary
    .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")
    .replace(TOKEN_PATTERN, "[REDACTED_TOKEN]")
    .replace(MEMBER_ID_PATTERN, "[REDACTED_MEMBER_ID]")
    .replace(PHONE_PATTERN, (match) =>
      /\d/.test(match) ? "[REDACTED_PHONE]" : match,
    );

  if (redacted.length <= MAX_OPERATIONAL_SUMMARY_LENGTH) return redacted;

  return `${redacted
    .slice(0, MAX_OPERATIONAL_SUMMARY_LENGTH - TRUNCATION_MARKER.length)
    .trimEnd()}${TRUNCATION_MARKER}`;
}
