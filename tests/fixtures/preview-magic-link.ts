const NEON_AUTH_HOST = /^[a-z0-9-]+\.neonauth\.[a-z0-9.-]+\.neon\.tech$/;

// Fixed-code refusal so a bad paste never lands on an arbitrary host or appears in output.
export function allowedMagicLink(raw: string, previewOrigin: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('MAGIC_LINK_UNPARSEABLE');
  }
  if (url.protocol !== 'https:') throw new Error('MAGIC_LINK_NOT_HTTPS');
  if (url.origin !== previewOrigin && !NEON_AUTH_HOST.test(url.hostname)) throw new Error('MAGIC_LINK_HOST_REFUSED');
  return url.toString();
}
