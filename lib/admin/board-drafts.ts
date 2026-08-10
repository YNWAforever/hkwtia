import "server-only";

import {requireAdmin} from "@/lib/auth/authorize";
import {
  boardDraftRepository,
  createBoardDraftRepository,
  type BoardDraft,
  type BoardDraftPreview,
  type BoardDraftRepository,
} from "@/lib/db/repos/board-drafts";
import type {Actor} from "@/lib/membership/lifecycle";

export {
  boardDraftRepository,
  createBoardDraftRepository,
};
export type {
  BoardDraft,
  BoardDraftPreview,
  BoardDraftRepository,
};

export async function listBoardDrafts(
  actor: Actor,
  repository: BoardDraftRepository = boardDraftRepository,
): Promise<readonly BoardDraft[]> {
  requireAdmin(actor);
  return repository.listUnpublished(actor);
}

export async function getBoardDraft(
  actor: Actor,
  id: string,
  repository: BoardDraftRepository = boardDraftRepository,
): Promise<BoardDraftPreview | null> {
  requireAdmin(actor);
  return repository.getUnpublished(actor, id);
}
