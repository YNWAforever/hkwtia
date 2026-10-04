import "server-only";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
import type { AdminActor } from "@/lib/membership/lifecycle";
import { requireAdmin } from "@/lib/auth/authorize";
import { aiDraftsRepository } from "@/lib/db/repos/ai-drafts";
import {
  contentDraftConfiguration,
  contentCaseId,
} from "@/lib/ai/content-drafts";
export async function contentDraftAssistance(
  actor: AdminActor,
  kind: "event" | "news",
  id: string,
  locale: "en" | "zh-HK",
) {
  requireAdmin(actor);
  const config = contentDraftConfiguration();
  const enabled =
    process.env.ADMIN_AI_DRAFTS_ENABLED === "true" &&
    process.env.ADMIN_AI_CONTENT_DRAFTS_ENABLED === "true";
  let unavailable = false;
  const read = async (target: "en" | "zh-HK") => {
    try {
      return await aiDraftsRepository.latestContentDraft(
        actor,
        contentCaseId(kind, id, target),
      );
    } catch {
      unavailable = true;
      return null;
    }
  };
  const [english, chinese] = await Promise.all([read("en"), read("zh-HK")]);
  return {
    kind,
    id,
    locale,
    labels: (locale === "zh-HK" ? zh : en).ContentAssistance,
    configured: config.ready,
    enabled,
    unavailable,
    drafts: { en: english, "zh-HK": chinese },
  };
}
