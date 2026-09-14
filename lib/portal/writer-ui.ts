import "server-only";

import type {WriterKind} from "@/lib/ai/writers/contracts";
import {aiEnv} from "@/lib/config/env";
import type {Actor} from "@/lib/membership/lifecycle";
import {writerQuotaFor, type WriterActionDependencies} from "@/lib/portal/writer-action-core";
import type {WriterAssistProps} from "@/components/portal/writer-assist";

type Translate = (key: string, values?: Record<string, string | number>) => string;
type MemberActor = Extract<Actor, {kind: "member"}>;

/**
 * The props a writer surface renders, or `null` to render no control at all.
 *
 * Null for a disabled agent, a plan with no allowance, or an unreachable quota
 * read: a member who cannot generate must not be shown a button that cannot
 * work, and a transient read failure must not make the form look broken.
 */
export async function writerAssistProps(
  kind: WriterKind,
  actor: MemberActor,
  t: Translate,
  options: Readonly<{enabled?: boolean; dependencies?: WriterActionDependencies}> = {},
): Promise<WriterAssistProps | null> {
  if (!(options.enabled ?? aiEnv().agentsEnabled)) return null;

  let quota;
  try {
    quota = await writerQuotaFor(actor, options.dependencies);
  } catch {
    return null;
  }
  if (quota.cap === 0) return null;

  return {
    kind,
    exhausted: quota.remaining <= 0,
    quotaLabel: Number.isFinite(quota.cap)
      ? t("quota", {remaining: quota.remaining, cap: quota.cap})
      : t("quotaUnlimited"),
    labels: {
      label: t("label"), briefLabel: t("briefLabel"), briefPlaceholder: t("briefPlaceholder"),
      generate: t("generate"), generating: t("generating"),
      errors: {
        INVALID: t("errors.INVALID"), FORBIDDEN: t("errors.FORBIDDEN"), NOT_ENTITLED: t("errors.NOT_ENTITLED"),
        QUOTA_EXCEEDED: t("errors.QUOTA_EXCEEDED"), UNAVAILABLE: t("errors.UNAVAILABLE"), FAILED: t("errors.FAILED"),
      },
    },
  };
}
