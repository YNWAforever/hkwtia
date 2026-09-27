import "server-only";

import {z} from "zod";

import {requireAdmin} from "@/lib/auth/authorize";
import {memberImportRepository} from "@/lib/db/repos/member-imports";
import {importMappingSchema, type ImportMapping} from "@/lib/admin/imports/validate";
import {MAX_MEMBER_IMPORT_BYTES} from "@/lib/admin/imports/parse";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

export type ImportRunSummary = Readonly<{runId: string; state: string; total: number; create: number; update: number; unchanged: number; duplicate: number; conflict: number; invalid: number}>;
export type ImportGateway = Readonly<{upload: (actor: AdminActor, bytes: Uint8Array, format: "csv" | "xlsx") => Promise<{uploadId: string; headers: readonly string[]; rowCount: number}>; validate: (actor: AdminActor, uploadId: string, mapping: ImportMapping) => Promise<ImportRunSummary>; confirm: (actor: AdminActor, runId: string, rowNumbers: readonly number[]) => Promise<ImportRunSummary>}>;
const uploadInput = z.object({bytes: z.custom<Uint8Array>((value) => ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === "[object Uint8Array]", "INVALID_IMPORT_BYTES"), format: z.enum(["csv", "xlsx"])}).strict();
const validationInput = z.object({uploadId: z.string().uuid(), mapping: importMappingSchema}).strict();
const confirmationInput = z.object({runId: z.string().uuid(), rowNumbers: z.array(z.number().int().min(2)).min(1).max(5000).refine((values) => new Set(values).size === values.length, "DUPLICATE_ROWS")}).strict();
function gate(actor: Actor): asserts actor is AdminActor {
  requireAdmin(actor);
  if (process.env.MEMBER_IMPORT_ENABLED !== "true") throw new Error("IMPORT_DISABLED");
}
export async function uploadMemberImport(actor: Actor, input: unknown, store: ImportGateway = memberImportRepository): Promise<{uploadId: string; headers: readonly string[]; rowCount: number}> {
  gate(actor);
  const parsed = uploadInput.parse(input);
  if (parsed.bytes.byteLength < 1 || parsed.bytes.byteLength > MAX_MEMBER_IMPORT_BYTES) throw new Error("IMPORT_SIZE_INVALID");
  return store.upload(actor, parsed.bytes, parsed.format);
}
export async function validateMemberImport(actor: Actor, input: unknown, store: ImportGateway = memberImportRepository): Promise<ImportRunSummary> {
  gate(actor);
  const parsed = validationInput.parse(input);
  return store.validate(actor, parsed.uploadId, parsed.mapping);
}
export async function confirmMemberImport(actor: Actor, input: unknown, store: ImportGateway = memberImportRepository): Promise<ImportRunSummary> {
  gate(actor);
  const parsed = confirmationInput.parse(input);
  return store.confirm(actor, parsed.runId, parsed.rowNumbers);
}
