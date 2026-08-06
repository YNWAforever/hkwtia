import type {PageCopyOverride} from "@/lib/i18n/apply-page-copy";

export type PageCopyLoader = (locale: string) => Promise<readonly PageCopyOverride[]>;

export type PageCopyCacheOptions = Readonly<{
  load?: PageCopyLoader;
  now?: () => number;
}>;

/**
 * Statically prerendered pages read overrides at build and at revalidation, so
 * the cost that matters lands on the `force-dynamic` routes, which would
 * otherwise pay a query per request for overrides they never use.
 *
 * Process-local, like the rate limiter and the view tracker: a save clears only
 * the instance that served it, and every other instance converges within the
 * TTL. Correctness does not depend on that — `revalidatePath` is what makes a
 * saved override appear, and a regenerating instance either has a cleared cache
 * or an entry at most one TTL old.
 */
const FRESH_TTL_MS = 30_000;
/** Shorter, so a database blip does not pin pages to bundle copy for a full TTL. */
const FAILURE_TTL_MS = 5_000;

type CacheEntry = Readonly<{expiresAt: number; overrides: readonly PageCopyOverride[]}>;

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<readonly PageCopyOverride[]>>();

async function loadFromRepository(locale: string): Promise<readonly PageCopyOverride[]> {
  const {listPageCopyForLocale} = await import("@/lib/db/repos/page-copy");
  return listPageCopyForLocale(locale);
}

/**
 * Never throws. `getRequestConfig` runs during `next build`, where
 * `DATABASE_URL` may be absent entirely; a rejected read there would fail the
 * build rather than degrade to the shipped copy.
 */
export async function pageCopyOverrides(
  locale: string,
  options: PageCopyCacheOptions = {},
): Promise<readonly PageCopyOverride[]> {
  const now = options.now ?? Date.now;
  const cached = cache.get(locale);
  if (cached && cached.expiresAt > now()) return cached.overrides;

  const pending = inFlight.get(locale);
  if (pending) return pending;

  const load = options.load ?? loadFromRepository;
  const request = (async () => {
    try {
      const overrides = await load(locale);
      cache.set(locale, {expiresAt: now() + FRESH_TTL_MS, overrides});
      return overrides;
    } catch {
      cache.set(locale, {expiresAt: now() + FAILURE_TTL_MS, overrides: []});
      return [];
    } finally {
      inFlight.delete(locale);
    }
  })();
  inFlight.set(locale, request);
  return request;
}

export function clearPageCopyCache(): void {
  cache.clear();
}
