/**
 * `crypto.randomUUID` is secure-context only. A caller that cannot mint an id is
 * a caller that cannot proceed at all, so the fallbacks step down rather than
 * throw. The value only has to be unique per call site's use — it is never a
 * secret and never an authorization input.
 *
 * Kept in one module rather than copied: the ticket checkout form and the inbox
 * composer both need an RFC-4122 v4 string their server-side `z.string().uuid()`
 * will accept, and two implementations is how one of them silently drifts.
 */
export function newAttemptId(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  try {
    if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
    if (typeof cryptoApi?.getRandomValues === "function") {
      const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
      // RFC 4122 version 4 and variant bits, because the server parses this
      // with `z.string().uuid()`.
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {
    // Fall through to the last resort below.
  }
  const random = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${random()}${random()}-${random()}-4${random().slice(1)}-8${random().slice(1)}-${random()}${random()}${random()}`;
}
