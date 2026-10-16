import "server-only";

import type {QueueActionState} from "@/components/admin/segment-results";
import {queueCampaign} from "@/lib/admin/campaigns";
import {requireAdmin} from "@/lib/auth/authorize";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import type {AdminActor} from "@/lib/membership/lifecycle";

type Dependencies = Readonly<{
  actor: () => Promise<AdminActor>;
  queue: typeof queueCampaign;
  revalidate: (path: string) => void;
}>;

export function createQueueCampaignAction({draftId, path, dependencies}: Readonly<{draftId: string; path: string; dependencies: Dependencies}>) {
  return async (_state: QueueActionState, formData: FormData): Promise<QueueActionState> => {
    try {
      const actor = await dependencies.actor();
      requireAdmin(actor);
      void draftId; void path; void formData;
      return {disposition: null, recipientCount: 0, error: "generic"};
    } catch (error) {
      if (isAuthorizationDenial(error)) throw error;
      return {disposition: null, recipientCount: 0, error: "generic"};
    }
  };
}
