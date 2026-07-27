const SECRET_ASSIGNMENT =
  /\b(authorization|cookie|set-cookie|session(?:_id)?|auth(?:entication)?[_-]?token|webhook[_-]?signature|stripe-signature|x-signature)\b\s*[:=]\s*(?:Bearer\s+)?[^\s,;]+/gi;
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const PROVIDER_SECRET =
  /\b(?:sk[-_]|rk[-_]|whsec_|sess_)[A-Za-z0-9_-]{8,}\b/gi;
const EMAIL =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /\+?\d[\d\s().-]{6,}\d/g;

export function redactRepositorySummary(summary: string): string {
  return summary
    .replace(
      SECRET_ASSIGNMENT,
      (_match, label: string) => `${label}=[redacted-secret]`,
    )
    .replace(BEARER_TOKEN, "Bearer [redacted-secret]")
    .replace(PROVIDER_SECRET, "[redacted-secret]")
    .replace(EMAIL, "[redacted-email]")
    .replace(PHONE, "[redacted-phone]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}
