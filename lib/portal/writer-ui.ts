import "server-only";

import type {WriterKind} from "@/lib/ai/writers/contracts";
import {aiEnv, type AiEnv} from "@/lib/config/env";
import type {Actor} from "@/lib/membership/lifecycle";
import {writerQuotaFor, type WriterActionDependencies} from "@/lib/portal/writer-action-core";
import type {WriterAssistProps} from "@/components/portal/writer-assist";

type Translate = (key: string, values?: Record<string, string | number>) => string;
type MemberActor = Extract<Actor, {kind: "member"}>;

export type WriterAssistOptions = Readonly<{
  enabled?: boolean;
  /**
   * Whether each provider's key is present. Injectable so a test can exercise
   * the no-key gate without fabricating the environment; the pages omit it and
   * the default reads `aiEnv()`.
   */
  credentials?: Readonly<{openai: boolean; anthropic: boolean}>;
  dependencies?: WriterActionDependencies;
}>;

/** The writer's model may be either provider, so either key turns the control on. */
function providerCredentials(environment: AiEnv): Readonly<{openai: boolean; anthropic: boolean}> {
  return {
    openai: Boolean(environment.openaiApiKey?.trim()),
    anthropic: Boolean(environment.anthropicApiKey?.trim()),
  };
}

/**
 * The props a writer surface renders, or `null` to render no control at all.
 *
 * Null for a disabled agent, a configured agent with no provider key, a plan
 * with no allowance, or an unreachable quota read: a member who cannot generate
 * must not be shown a button that cannot work, and a transient read failure
 * must not make the form look broken. Spec §4.6 names the no-key case next to
 * `AGENTS_ENABLED` off — a dead button is worse than none.
 */
export async function writerAssistProps(
  kind: WriterKind,
  actor: MemberActor,
  t: Translate,
  options: WriterAssistOptions = {},
): Promise<WriterAssistProps | null> {
  if (!(options.enabled ?? aiEnv().agentsEnabled)) return null;

  const credentials = options.credentials ?? providerCredentials(aiEnv());
  if (!credentials.openai && !credentials.anthropic) return null;

  let quota;
  try {
    quota = await writerQuotaFor(actor, options.dependencies);
  } catch (error) {
    // Logged so a persistent database fault is distinguishable from "no
    // allowance". Neither the brief nor any member data is logged.
    console.error("portal-writer-assist: quota read failed", error);
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
