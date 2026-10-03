import "server-only";
import type {AgentStreamRequest} from "@/lib/ai/provider";
/** Capture only a validated request identifier on accepted HTTP, before consuming the body. */
export function receiptAwareFetch(
  receipt: AgentStreamRequest["onProviderReceipt"],
): typeof globalThis.fetch {
  return async (input, init) => {
    const response = await globalThis.fetch(input, init);
    const id =
      response.headers.get("x-request-id") ??
      response.headers.get("request-id");
    if (response.ok && id && /^[A-Za-z0-9_.:-]{1,200}$/.test(id))
      await receipt?.(id);
    return response;
  };
}
