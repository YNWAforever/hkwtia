import {adminNavigationGroups} from "@/config/internal-navigation";
import {parsePortalContinuation} from "@/lib/portal/continuation";

export type LoginIntent = "member" | "admin";
export type LoginDestination = Readonly<{intent: LoginIntent; path: string}>;

const ADMIN_STATIC_ROUTES = new Set<string>([
  ...adminNavigationGroups.flatMap((group) => group.links.map((link) => link.href)),
  "/admin/batches", "/admin/members/queue", "/admin/members/import",
  "/admin/members/grants", "/admin/members/communications", "/admin/page-copy",
]);
const ADMIN_UUID_DETAIL = /^\/admin\/(?:announcements|batches|campaigns|cohorts|events-mgmt|inbox|landing-partners|media|members|news|partners)\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADMIN_NESTED_UUID_DETAIL = /^\/admin\/reports\/board-drafts\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADMIN_PAGE_COPY_NAMESPACE = /^\/admin\/page-copy\/[A-Za-z][A-Za-z0-9_-]{0,79}$/;
const QUERY_KEYS: Readonly<Record<string, readonly string[]>> = {
  "/admin/batches": ["state", "operation", "cursor"],
  "/admin/members": ["q", "status", "planCode", "renewalFrom", "renewalTo", "companyId", "locale", "completeness", "sort", "limit", "cursor", "history", "view"],
  "/admin/members/queue": ["status", "q", "limit", "cursor"],
  "/admin/contacts": ["stage", "source", "owner", "optIn", "q", "cursor", "saved"],
  "/admin/inbox": ["channel", "handling"],
  "/admin/automations": ["status", "cursor"],
  "/admin/reports": ["period", "view"],
};

/** A path for post-login navigation only. Every destination is still protected by its server guard. */
export function allowedAdminDestination(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048 || !raw.startsWith("/admin")) return null;
  if (raw.includes("#") || raw.includes("\\") || /[\u0000-\u001f\u007f]/.test(raw)) return null;
  const separator = raw.indexOf("?");
  const path = separator === -1 ? raw : raw.slice(0, separator);
  const query = separator === -1 ? "" : raw.slice(separator + 1);
  if (path.includes("%") || path.includes("//") || !(
    ADMIN_STATIC_ROUTES.has(path) || ADMIN_UUID_DETAIL.test(path) ||
    ADMIN_NESTED_UUID_DETAIL.test(path) || ADMIN_PAGE_COPY_NAMESPACE.test(path)
  )) return null;
  if (!query) return path;
  const allowedKeys = QUERY_KEYS[path];
  if (!allowedKeys) return null;
  const parsed = new URLSearchParams(query);
  if ([...parsed].some(([key, value]) => !allowedKeys.includes(key) || value.length > 256 || /[\u0000-\u001f\u007f]/.test(value))) return null;
  return `${path}?${parsed.toString()}`;
}

export function parseLoginDestination(raw: string | null | undefined, intent: LoginIntent): LoginDestination {
  return {intent, path: intent === "member" ? parsePortalContinuation(raw) : allowedAdminDestination(raw) ?? "/admin"};
}
