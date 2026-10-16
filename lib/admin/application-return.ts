import "server-only";
import { localizedPath } from "@/lib/urls";
import { applicationQueueQuerySchema } from "@/lib/db/repos/admin-members";
import type { AppLocale } from "@/i18n/routing";
/** Preserve validated queue scope, never an arbitrary redirect, actor or unbounded query. */
export function applicationQueueReturnHref(
  locale: AppLocale,
  raw: unknown,
): string {
  const base = localizedPath(locale, "/admin/members/queue");
  if (typeof raw !== "string" || raw.length > 1500) return base;
  try {
    const url = new URL(raw, "https://hkwtia-return.invalid");
    if (
      url.origin !== "https://hkwtia-return.invalid" ||
      url.hash ||
      !["/admin/members/queue", "/zh/admin/members/queue"].includes(
        url.pathname,
      )
    )
      return base;
    if (
      [...url.searchParams.keys()].some(
        (key) =>
          !["status", "q", "limit", "cursor"].includes(key) ||
          url.searchParams.getAll(key).length !== 1,
      )
    )
      return base;
    if (!url.search) return base;
    const parsed = applicationQueueQuerySchema.safeParse({
      status: url.searchParams.get("status") ?? undefined,
      search: url.searchParams.get("q") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? null,
    });
    if (!parsed.success) return base;
    const query = new URLSearchParams({
      status: parsed.data.status,
      q: parsed.data.search,
      limit: String(parsed.data.limit),
    });
    if (parsed.data.cursor) query.set("cursor", parsed.data.cursor);
    return base + "?" + query;
  } catch {
    return base;
  }
}
