import {adminNavigationGroups} from "@/config/internal-navigation";
import {MEMBERSHIP_PLAN_CODES} from "@/lib/membership/constants";
import {parseJoinContinuation} from "@/lib/membership/join-navigation";
import {isPortalContinuation} from "@/lib/portal/continuation";

export type LoginIntent = "member" | "admin";
export type LoginDestination = Readonly<{intent: LoginIntent; path: string}>;

const ADMIN_STATIC_ROUTES = new Set<string>([
  ...adminNavigationGroups.flatMap((group) => group.links.map((link) => link.href)),
  "/admin/batches", "/admin/members/queue", "/admin/members/import",
  "/admin/members/grants", "/admin/members/communications", "/admin/page-copy",
]);
const ADMIN_UUID_DETAIL = /^\/admin\/(?:announcements|batches|campaigns|cohorts|events-mgmt|inbox|landing-partners|media|members|news|partners)\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADMIN_EVENT_DETAIL = /^\/admin\/events-mgmt\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADMIN_MEMBER_DETAIL = /^\/admin\/members\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_TABS = new Set(["content", "attendees", "orders", "notifications"]);
const MEMBER_TIMELINE_SECTIONS = new Set(["engagement", "emails", "events", "purchases", "notes", "journeys", "whatsapp", "suppressions"]);
const EVENT_DETAIL_QUERY_KEYS = ["tab", "q", "cursor"] as const;
const MEMBER_DETAIL_QUERY_KEYS = ["section", "historyQ", "historyCursor", "q", "status", "planCode", "renewalFrom", "renewalTo", "companyId", "locale", "completeness", "sort", "limit", "cursor", "history"] as const;
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

const APPLICATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Portal or Join only; application ownership is checked after authentication. */
export function allowedMemberDestination(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return null;
  if (isPortalContinuation(raw)) return raw;
  if (raw === "/join") return raw;
  if (!raw.startsWith("/join?") || raw.includes("#") || raw.includes("\\") || /[\u0000-\u001f\u007f]/.test(raw)) return null;
  const query = new URLSearchParams(raw.slice("/join?".length));
  if ([...query].some(([key, value]) => !["plan", "application", "next"].includes(key) || value.length > 256 || query.getAll(key).length !== 1)) return null;
  const plan = query.get("plan");
  const application = query.get("application");
  const next = query.get("next");
  if (plan !== null && !(MEMBERSHIP_PLAN_CODES as readonly string[]).includes(plan)) return null;
  if (application !== null && (!plan || !APPLICATION_ID.test(application))) return null;
  if (next !== null && parseJoinContinuation(next) !== next) return null;
  if (!plan && !next) return null;
  return `/join?${query.toString()}`;
}
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
  const isEventDetail = ADMIN_EVENT_DETAIL.test(path);
  const isMemberDetail = ADMIN_MEMBER_DETAIL.test(path);
  const allowedKeys: readonly string[] | undefined = isEventDetail ? EVENT_DETAIL_QUERY_KEYS
    : isMemberDetail ? MEMBER_DETAIL_QUERY_KEYS : QUERY_KEYS[path];
  if (!allowedKeys) return null;
  const parsed = new URLSearchParams(query);
  if ([...parsed].some(([key, value]) => !allowedKeys.includes(key) || value.length > 256 || /[\u0000-\u001f\u007f]/.test(value))) return null;
  if (isEventDetail) {
    const tab = parsed.get("tab");
    if (parsed.getAll("tab").length > 1 || (tab && !EVENT_TABS.has(tab))) return null;
    if ((parsed.has("q") || parsed.has("cursor")) && tab !== "attendees" && tab !== "orders") return null;
  }
  if (isMemberDetail) {
    const section = parsed.get("section");
    if (parsed.getAll("section").length > 1 || (section && !MEMBER_TIMELINE_SECTIONS.has(section))) return null;
    if ((parsed.has("historyQ") || parsed.has("historyCursor")) && !section) return null;
  }
  return `${path}?${parsed.toString()}`;
}

export function parseLoginDestination(raw: string | null | undefined, intent: LoginIntent): LoginDestination {
  return {intent, path: intent === "member" ? allowedMemberDestination(raw) ?? "/portal" : allowedAdminDestination(raw) ?? "/admin"};
}
