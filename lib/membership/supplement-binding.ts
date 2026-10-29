import "server-only";
import {createSupplementRepository} from "@/lib/db/repos/application-supplements";
import {createSupplementService, type SupplementRepository, type SupplementResult} from "@/lib/membership/supplement-service";
import type {Actor} from "@/lib/membership/lifecycle";

type Dependencies = {
  /** Explicit server composition gate; never derive enablement from client input. */
  enabled: () => boolean;
  actor: () => Promise<Actor | null>;
  repository?: SupplementRepository;
};
/** Server-only form action seam. No actor argument crosses the form boundary.
 * Production composition must supply a request session resolver. Tests inject synthetic
 * actors and an isolated SQL repository; this is not authenticated HTTP evidence.
 */
export function createSupplementBinding(deps: Dependencies) {
  const service = createSupplementService(deps.repository ?? createSupplementRepository());
  async function mutate(kind: "publish" | "respond", input: unknown): Promise<SupplementResult> {
    if (!deps.enabled()) return {status:"forbidden"};
    const actor = await deps.actor();
    if (!actor) return {status:"forbidden"};
    return kind === "publish" ? service.publishSupplementRequest(actor,input) : service.respondToSupplementRequest(actor,input);
  }
  return {
    publish: (input: unknown) => mutate("publish",input),
    respond: (input: unknown) => mutate("respond",input),
    async receipt(operationRequestId: string) {
      // Historical receipts stay readable independently of write enablement.
      const actor = await deps.actor();
      return actor ? service.getOperationReceipt(actor,{operationRequestId}) : null;
    },
  };
}
