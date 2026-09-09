// Note: /portal/company/seats/accept deliberately excluded—it's a one-time, token-gated invitation route, not a generic continuation target.
export const PORTAL_CONTINUATIONS = [
  "/portal",
  "/portal/profile",
  "/portal/company",
  "/portal/company/listing",
  "/portal/company/seats",
  "/portal/billing",
  "/portal/documents",
  "/portal/events",
  "/portal/directory",
] as const;

// The member event editor is the one parameterised Portal destination. Its
// pages redirect to /member-login themselves (the layout/page parallel render,
// audit F21), so the allowlist has to carry the deep link or sign-in would
// always land on /portal/events instead of the row the member was editing.
// Only a v4 uuid is accepted: the id comes from our own rows, and a looser
// pattern would let an arbitrary `next` through to the callback URL.
const MEMBER_EVENT_CONTINUATION =
  /^\/portal\/events\/(?:new|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/edit)$/i;

export type PortalContinuation =
  | (typeof PORTAL_CONTINUATIONS)[number]
  | "/portal/events/new"
  | `/portal/events/${string}/edit`;

const DEFAULT_PORTAL_CONTINUATION: PortalContinuation = "/portal";

export function isPortalContinuation(path: string): path is PortalContinuation {
  return (PORTAL_CONTINUATIONS as readonly string[]).includes(path) || MEMBER_EVENT_CONTINUATION.test(path);
}

export function parsePortalContinuation(
  path: string | null | undefined,
): PortalContinuation {
  if (typeof path === "string" && isPortalContinuation(path)) {
    return path;
  }
  return DEFAULT_PORTAL_CONTINUATION;
}
