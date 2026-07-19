"use server";

import {revalidatePath} from "next/cache";

import type {QueueActionState} from "@/components/admin/segment-results";
import {createQueueCampaignAction} from "@/lib/admin/campaign-action-core";
import {queueCampaign} from "@/lib/admin/campaigns";
import {requireAdminActor} from "@/lib/auth/actor";

export async function queueCampaignAction(draftId: string, path: string, previousState: QueueActionState, formData: FormData): Promise<QueueActionState> {
  return createQueueCampaignAction({
    draftId,
    path,
    dependencies: {actor: requireAdminActor, queue: queueCampaign, revalidate: revalidatePath},
  })(previousState, formData);
}
