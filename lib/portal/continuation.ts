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

export type PortalContinuation = (typeof PORTAL_CONTINUATIONS)[number];

const DEFAULT_PORTAL_CONTINUATION: PortalContinuation = "/portal";

export function isPortalContinuation(path: string): path is PortalContinuation {
  return (PORTAL_CONTINUATIONS as readonly string[]).includes(path);
}

export function parsePortalContinuation(
  path: string | null | undefined,
): PortalContinuation {
  if (typeof path === "string" && isPortalContinuation(path)) {
    return path;
  }
  return DEFAULT_PORTAL_CONTINUATION;
}
