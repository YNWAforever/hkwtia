import "server-only";

import type {QueueActionState} from "@/components/admin/segment-results";
import {campaignDraftSchema, queueCampaign} from "@/lib/admin/campaigns";
import type {AdminActor} from "@/lib/membership/lifecycle";

type Dependencies = Readonly<{
  actor: () => Promise<AdminActor>;
  queue: typeof queueCampaign;
  revalidate: (path: string) => void;
}>;

export function createQueueCampaignAction({draftId, path, dependencies}: Readonly<{draftId: string; path: string; dependencies: Dependencies}>) {
  return async (_state: QueueActionState, formData: FormData): Promise<QueueActionState> => {
    try {
      const result = await dependencies.queue(await dependencies.actor(), {
        segmentId: formData.get("segmentId"),
        template: formData.get("template"),
        localeStrategy: "profile",
        idempotencyKey: campaignDraftSchema.parse(draftId),
      });
      dependencies.revalidate(path);
      return {disposition: result.disposition, recipientCount: result.recipientCount, error: null};
    } catch {
      return {disposition: null, recipientCount: 0, error: "generic"};
    }
  };
}
