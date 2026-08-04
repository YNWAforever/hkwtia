"use server";

import {revalidatePath} from "next/cache";
import {z} from "zod";

import {requireActor} from "@/lib/auth/actor";
import {cohortRepository, type CohortRepository} from "@/lib/db/repos/cohorts";
import type {Actor} from "@/lib/membership/lifecycle";
import {localizedPath} from "@/lib/urls";

const formSchema = z.object({
  cohortId: z.string().uuid(),
  market: z.string().trim().min(1).max(120),
  readiness: z.string().trim().min(1).max(500),
  consent: z.literal("on"),
  locale: z.enum(["en", "zh-HK"]),
}).strict();

export type MemberCohortRepository = Pick<CohortRepository, "createApplication">;
export type CohortApplicationActionState = Readonly<{status: "idle" | "success" | "invalid" | "unauthorized" | "error"}>;

function rawFormData(formData: FormData): Record<string, string> {
  return Object.fromEntries(["cohortId", "market", "readiness", "consent", "locale"].map((key) => [key, String(formData.get(key) ?? "")]));
}

export async function applyToCohort(
  actor: Actor,
  cohortId: string,
  input: unknown,
  repository: MemberCohortRepository = cohortRepository,
) {
  return repository.createApplication(actor, cohortId, input);
}

export async function applyToCohortAction(formData: FormData): Promise<CohortApplicationActionState> {
  const parsed = formSchema.safeParse(rawFormData(formData));
  if (!parsed.success) return {status: "invalid"};

  try {
    const actor = await requireActor();
    await applyToCohort(actor, parsed.data.cohortId, {
      cohortId: parsed.data.cohortId,
      readiness: {market: parsed.data.market, readiness: parsed.data.readiness},
    });
    revalidatePath(localizedPath(parsed.data.locale, "/launchpad"));
    revalidatePath(localizedPath(parsed.data.locale, "/portal"));
    return {status: "success"};
  } catch (error) {
    if (error instanceof Error && (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN")) return {status: "unauthorized"};
    if (error instanceof Error && (error.message === "COHORT_NOT_OPEN" || error.message === "COHORT_APPLICATION_COHORT_MISMATCH")) return {status: "invalid"};
    return {status: "error"};
  }
}
