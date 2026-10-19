// Note: /portal/company/seats/accept deliberately excluded—it's a one-time, token-gated invitation route, not a generic continuation target.
export const PORTAL_CONTINUATIONS = [
  "/portal",
  "/portal/applications",
  "/portal/profile",
  "/portal/company",
  "/portal/company/listing",
  "/portal/company/seats",
  "/portal/billing",
  "/portal/documents",
  "/portal/events",
  "/portal/events/my",
  "/portal/directory",
  "/portal/tools",
] as const;

// Member event details/editors and own orders are parameterised destinations. Their
// pages redirect to /member-login themselves (the layout/page parallel render,
// audit F21), so the allowlist has to carry the deep link or sign-in would
// always land on /portal/events instead of the row the member was editing.
// Only a v4 uuid is accepted: the id comes from our own rows, and a looser
// pattern would let an arbitrary `next` through to the callback URL.
const MEMBER_EVENT_CONTINUATION =
  /^\/portal\/events\/(?:new|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:\/edit)?)$/i;
const MEMBER_ORDER_CONTINUATION = /^\/portal\/orders\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEMBER_APPLICATION_CONTINUATION = /^\/portal\/applications\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type CompanyPath = "/portal/company" | "/portal/company/listing" | "/portal/company/seats";
function isCompanyContinuation(path: string): boolean {
  const [base, query, extra] = path.split("?");
  if (extra !== undefined || !query || !["/portal/company", "/portal/company/listing", "/portal/company/seats"].includes(base)) return false;
  const entries = [...new URLSearchParams(query)];
  const keys = entries.map(([key]) => key);
  return keys.includes("companyId") && new Set(keys).size === keys.length && entries.every(([key, value]) =>
    (key === "companyId" || (base === "/portal/company/seats" && key === "batchId")) && UUID.test(value));
}

export type PortalContinuation =
  | (typeof PORTAL_CONTINUATIONS)[number]
  | "/portal/events/new"
  | `/portal/events/${string}`
  | `/portal/orders/${string}`
  | `/portal/events/${string}/edit`
  | `/portal/applications/${string}`;
// Company context has its own narrow runtime validator; arbitrary query strings stay rejected.
export type CompanyContinuation = `${CompanyPath}?${string}`;

const DEFAULT_PORTAL_CONTINUATION: PortalContinuation = "/portal";

export function isPortalContinuation(path: string): path is PortalContinuation | CompanyContinuation {
  return (PORTAL_CONTINUATIONS as readonly string[]).includes(path) || MEMBER_EVENT_CONTINUATION.test(path) || MEMBER_ORDER_CONTINUATION.test(path) || MEMBER_APPLICATION_CONTINUATION.test(path) || isCompanyContinuation(path);
}

export function parsePortalContinuation(
  path: string | null | undefined,
): PortalContinuation | CompanyContinuation {
  if (typeof path === "string" && isPortalContinuation(path)) {
    return path;
  }
  return DEFAULT_PORTAL_CONTINUATION;
}

export function companyContinuation(path: CompanyPath, companyId: unknown, batchId?: unknown): PortalContinuation | CompanyContinuation {
  if (typeof companyId !== "string" || !UUID.test(companyId)) return path;
  const query = new URLSearchParams({companyId});
  if (path === "/portal/company/seats" && typeof batchId === "string" && UUID.test(batchId)) query.set("batchId", batchId);
  return `${path}?${query}`;
}
