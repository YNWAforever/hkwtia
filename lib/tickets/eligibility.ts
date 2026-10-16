import "server-only";

/** Use the stricter visibility when old and new event flags disagree. */
export function ticketPurchaseAudience(event: Readonly<{visibility: string; memberOnly: boolean}>): "public" | "members_only" | "invite_only" {
  if (event.visibility === "invite_only") return "invite_only";
  if (event.visibility === "members_only" || event.memberOnly) return "members_only";
  return event.visibility === "public" ? "public" : "invite_only";
}
