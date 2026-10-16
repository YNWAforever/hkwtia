import "server-only";

import {requireAdmin} from "@/lib/auth/authorize";
import {MAX_MEMBER_IMPORT_BYTES} from "@/lib/admin/imports/parse";
import {BoundedBodyError, readBoundedBytes} from "@/lib/security/bounded-body";
import {isSameOrigin} from "@/lib/security/request-origin";
import type {Actor} from "@/lib/membership/lifecycle";

type Dependencies = Readonly<{actor: () => Promise<Actor>; expectedOrigin: () => string; upload: (actor: Actor, input: unknown) => Promise<{uploadId: string; headers: readonly string[]; rowCount: number}>}>;
const headers = {"cache-control": "no-store", "content-type": "application/json"};
function json(status: number, body: Record<string, unknown>) {return new Response(JSON.stringify(body), {status, headers});}
export function createMemberImportUploadPost(dependencies: Dependencies) {
  return async function post(request: Request): Promise<Response> {
    let actor: Actor;
    try {actor = await dependencies.actor(); requireAdmin(actor);}
    catch {return new Response("Not found", {status: 404, headers: {"cache-control": "no-store"}});}
    let origin: string;
    try {origin = dependencies.expectedOrigin();} catch {return json(500, {error: "IMPORT_UPLOAD_FAILED"});}
    if (!isSameOrigin(request, origin)) return json(403, {error: "IMPORT_ORIGIN_INVALID"});
    const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    const format = contentType === "text/csv" ? "csv" : contentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ? "xlsx" : null;
    if (!format) return json(415, {error: "IMPORT_TYPE_UNSUPPORTED"});
    try {
      const bytes = await readBoundedBytes(request, MAX_MEMBER_IMPORT_BYTES, {requireContentLength: true});
      const uploaded = await dependencies.upload(actor, {bytes, format});
      return json(201, uploaded);
    } catch (error) {
      if (error instanceof BoundedBodyError) return json(error.reason === "TOO_LARGE" ? 413 : 400, {error: "IMPORT_SIZE_INVALID"});
      if (error instanceof Error && error.message === "IMPORT_DISABLED") return json(503, {error: "IMPORT_DISABLED"});
      if (error instanceof Error && error.message.startsWith("IMPORT_")) return json(400, {error: error.message});
      return json(500, {error: "IMPORT_UPLOAD_FAILED"});
    }
  };
}
