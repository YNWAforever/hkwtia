import "server-only";
import type {Actor} from "@/lib/membership/lifecycle";

export type SupplementRequest = Readonly<{
  id: string; applicationId: string; applicantUserId: string; version: number;
  status: "draft" | "published" | "responded" | "closed" | "cancelled";
  items: readonly Readonly<{itemId: string; label: string; required: boolean}>[];
  dueAt: string | null;
}>;

/** Offline projection boundary; repository integration follows isolated DB acceptance. */
export function memberSupplementView(actor: Actor, request: SupplementRequest) {
  if (actor.kind !== "member" || actor.profileId !== request.applicantUserId) throw new Error("FORBIDDEN");
  if (request.status === "draft") return null;
  return {
    id: request.id, applicationId: request.applicationId, version: request.version,
    status: request.status,
    items: request.items.map(({itemId, label, required}) => ({itemId, label, required})),
    dueAt: request.dueAt,
  };
}
