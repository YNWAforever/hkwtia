import "server-only";

import {z} from "zod";

import {requireAdmin} from "@/lib/auth/authorize";
import {auditEvents, memberNotes} from "@/lib/db/server-schema";
import {getDb} from "@/lib/db/repos/common";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

const memberNoteInputSchema = z.object({
  profileId: z.string().min(1),
  body: z.string().trim().min(1).max(4000),
  replacesNoteId: z.string().min(1).optional(),
}).strict();

export type MemberNoteInput = z.input<typeof memberNoteInputSchema>;
type ParsedMemberNoteInput = z.output<typeof memberNoteInputSchema>;

export type MemberNoteTransaction = Readonly<{
  insertNote: (input: Readonly<{profileId: string; authorProfileId: string; body: string; replacesNoteId?: string}>) => Promise<string>;
  insertAudit: (input: Readonly<{actorUserId: string; actorType: AdminActor["kind"]; action: "member_note.appended"; targetType: "profile"; targetId: string; metadata: Readonly<{noteId: string; replacesNoteId?: string}>}>) => Promise<void>;
}>;

export type MemberNoteDependencies = Readonly<{transaction: <T>(work: (transaction: MemberNoteTransaction) => Promise<T>) => Promise<T>}>;

async function defaultTransaction<T>(work: (transaction: MemberNoteTransaction) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => work({
    insertNote: async (input) => {
      const rows = await tx.insert(memberNotes).values(input).returning({id: memberNotes.id});
      const row = rows[0];
      if (!row) throw new Error("MEMBER_NOTE_INSERT_FAILED");
      return row.id;
    },
    insertAudit: async (input) => {
      await tx.insert(auditEvents).values(input);
    },
  }));
}

const defaultDependencies: MemberNoteDependencies = {transaction: defaultTransaction};

export async function appendMemberNote(actor: Actor, input: unknown, dependencies: MemberNoteDependencies = defaultDependencies): Promise<string> {
  requireAdmin(actor);
  const parsed: ParsedMemberNoteInput = memberNoteInputSchema.parse(input);
  return dependencies.transaction(async (transaction) => {
    const noteId = await transaction.insertNote({
      profileId: parsed.profileId,
      authorProfileId: actor.profileId,
      body: parsed.body,
      ...(parsed.replacesNoteId ? {replacesNoteId: parsed.replacesNoteId} : {}),
    });
    await transaction.insertAudit({
      actorUserId: actor.profileId,
      actorType: actor.kind,
      action: "member_note.appended",
      targetType: "profile",
      targetId: parsed.profileId,
      metadata: {noteId, ...(parsed.replacesNoteId ? {replacesNoteId: parsed.replacesNoteId} : {})},
    });
    return noteId;
  });
}