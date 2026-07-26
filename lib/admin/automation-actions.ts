"use server";

import {revalidatePath} from "next/cache";
import {notFound} from "next/navigation";

import {
  retryAutomation,
  runRetryAutomationAction,
  type RetryAutomationActionState,
} from "@/lib/admin/automations";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {requireAdminActor} from "@/lib/auth/actor";
import {localizedPath} from "@/lib/urls";

export async function retryAutomationAction(
  previousState: RetryAutomationActionState,
  formData: FormData,
): Promise<RetryAutomationActionState> {
  try {
    const actor = await requireAdminActor();
    return await runRetryAutomationAction(previousState, formData, {
      actor,
      now: () => new Date(),
      retry: (retryActor, journeyId, scheduledAt) =>
        retryAutomation(retryActor, journeyId, scheduledAt),
      onSuccess: (locale) => {
        revalidatePath(localizedPath(locale, "/admin/automations"));
      },
    });
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}
