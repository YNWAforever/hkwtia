import "server-only";
import { draftWorkRepository } from "@/lib/db/repos/ai-draft-work";
/** Internal callers establish their session/service actor before entering this server-only work port. */
export const claimDraftWork = draftWorkRepository.claimDraftWork;
export const markDraftRequestStarted =
  draftWorkRepository.markDraftRequestStarted;
export const finishDraftWork = draftWorkRepository.finishDraftWork;
