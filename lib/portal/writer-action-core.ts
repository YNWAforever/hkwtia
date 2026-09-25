import {AgentRuntimeError} from "@/lib/ai/runtime";
import type {MembershipPlanCode} from "@/lib/membership/constants";
import {requireMember, type Actor} from "@/lib/membership/lifecycle";
import {aiWriterRunsPerMonth, isBenefitEligibleMembershipStatus} from "@/lib/membership/entitlements";
import {writerBriefSchema, type WriterKind} from "@/lib/ai/writers/contracts";
import {generateWriterCopy} from "@/lib/ai/writers/generate";
import {agentRunsRepository} from "@/lib/db/repos/agent-runs";
import {membershipsRepository} from "@/lib/db/repos/memberships";

type MemberActor = Extract<Actor, {kind: "member"}>;

export type WriterActionState =
  | Readonly<{status: "ok"; copy: Record<string, string>}>
  | Readonly<{status: "error"; code: "INVALID" | "FORBIDDEN" | "NOT_ENTITLED" | "QUOTA_EXCEEDED" | "UNAVAILABLE" | "FAILED"}>;

export type WriterActionDependencies = Readonly<{
  plansFor: (actor: MemberActor) => Promise<readonly MembershipPlanCode[]>;
  countRuns: (actor: MemberActor, since: Date) => Promise<number>;
  generate: (input: {memberActor: MemberActor; kind: WriterKind; brief: string}) => Promise<Record<string, string>>;
  now: () => Date;
}>;

/**
 * The first instant of the current month in Hong Kong time, which is the window
 * the quota is quoted in ("20 a month"). Hong Kong is UTC+8 with no DST, so the
 * offset is a constant.
 */
export function startOfHongKongMonth(now: Date): Date {
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const monthStartUtc = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1);
  return new Date(monthStartUtc - 8 * 60 * 60 * 1000);
}

const defaultDependencies: WriterActionDependencies = {
  plansFor: async (actor) => (await membershipsRepository.list(actor))
    .filter((membership) => isBenefitEligibleMembershipStatus(membership.status))
    .map((membership) => membership.planCode),
  countRuns: (actor, since) => agentRunsRepository.countWriterRuns(actor, since),
  generate: ({memberActor, kind, brief}) => generateWriterCopy({memberActor, kind, brief}),
  now: () => new Date(),
};

/** The member's best writer allowance across their active memberships. */
function quotaFor(plans: readonly MembershipPlanCode[]): number {
  return plans.reduce((best, plan) => Math.max(best, aiWriterRunsPerMonth(plan)), 0);
}

export async function runWriterAssist(
  actor: Actor,
  input: unknown,
  dependencies: WriterActionDependencies = defaultDependencies,
): Promise<WriterActionState> {
  try {
    requireMember(actor);
  } catch {
    return {status: "error", code: "FORBIDDEN"};
  }

  const parsed = writerBriefSchema.safeParse(input);
  if (!parsed.success) return {status: "error", code: "INVALID"};

  let plans: readonly MembershipPlanCode[];
  try {
    plans = await dependencies.plansFor(actor);
  } catch {
    // A transient membership read is a server fault, but it must still reach the
    // member as a state to render rather than as a rejected action that discards
    // the brief they typed.
    return {status: "error", code: "FAILED"};
  }
  let cap: number;
  try {
    cap = quotaFor(plans);
  } catch {
    // entitlementsFor throws on a plan code it does not know; the plan column is
    // an enum today, but nothing may escape the action as a rejected promise.
    return {status: "error", code: "FAILED"};
  }
  if (cap === 0) return {status: "error", code: "NOT_ENTITLED"};

  const since = startOfHongKongMonth(dependencies.now());
  let runs: number;
  try {
    runs = await dependencies.countRuns(actor, since);
  } catch {
    return {status: "error", code: "FAILED"};
  }
  if (runs >= cap) return {status: "error", code: "QUOTA_EXCEEDED"};

  try {
    const copy = await dependencies.generate({memberActor: actor, kind: parsed.data.kind, brief: parsed.data.brief});
    return {status: "ok", copy};
  } catch (error) {
    // A missing key or an unconfigured model is not the member's problem, and
    // reads differently from a transient provider failure.
    const unavailable = error instanceof AgentRuntimeError && error.code === "configuration_error";
    return {status: "error", code: unavailable ? "UNAVAILABLE" : "FAILED"};
  }
}
