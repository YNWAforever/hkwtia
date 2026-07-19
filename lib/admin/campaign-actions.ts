"use server";

import {revalidatePath} from "next/cache";
import {notFound} from "next/navigation";

import type {QueueActionState} from "@/components/admin/segment-results";
import {createQueueCampaignAction} from "@/lib/admin/campaign-action-core";
import {queueCampaign} from "@/lib/admin/campaigns";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {requireAdminActor} from "@/lib/auth/actor";

export async function queueCampaignAction(draftId: string, path: string, previousState: QueueActionState, formData: FormData): Promise<QueueActionState> {
  try {
    return await createQueueCampaignAction({
      draftId,
      path,
      dependencies: {actor: requireAdminActor, queue: queueCampaign, revalidate: revalidatePath},
    })(previousState, formData);
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}
