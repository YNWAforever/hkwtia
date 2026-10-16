// Shared between tests/e2e/wisetech-zh-walk.spec.ts (checks a live rendered page for a leaked
// raw message key) and tests/unit/zh-walk-regex.test.ts (checks the pattern itself against known
// false-positive shapes) so the two specs can never drift on what counts as a "raw key".
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Segment character classes are `[A-Za-z0-9_]+`, not `[A-Za-z]+`: a letters-only class misses
// digit-bearing keys such as `Membership.first90.eyebrow` (rendered, unresolved, on
// `/zh/membership`, which the walk covers).
export function buildRawMessageKeyPattern(namespaces: readonly string[]): RegExp {
  return new RegExp(`\\b(?:${namespaces.map(escapeRegExp).join("|")})\\.[A-Za-z0-9_]+(?:\\.[A-Za-z0-9_]+)*\\b`);
}
