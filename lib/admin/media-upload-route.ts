import "server-only";

import type {MediaUploadServiceInput} from "@/lib/admin/media-upload-service";
import {requireAdmin} from "@/lib/auth/authorize";
import type {MediaRow} from "@/lib/db/server-schema";
import {MAX_MEDIA_BYTES, MediaUploadValidationError} from "@/lib/media/image-upload";
import type {Actor} from "@/lib/membership/lifecycle";
import {BoundedBodyError, readBoundedBytes} from "@/lib/security/bounded-body";
import {isSameOrigin} from "@/lib/security/request-origin";

type Dependencies = Readonly<{
  actor: () => Promise<Actor>;
  expectedOrigin: () => string;
  upload: (actor: Actor, input: MediaUploadServiceInput) => Promise<Pick<MediaRow, "id" | "url">>;
}>;

const jsonHeaders = {"cache-control": "no-store", "content-type": "application/json"};

function json(status: number, body: Readonly<Record<string, unknown>>) {
  return new Response(JSON.stringify(body), {status, headers: jsonHeaders});
}

export function createMediaUploadPost(dependencies: Dependencies) {
  return async function post(request: Request): Promise<Response> {
    let actor: Actor;
    try {
      actor = await dependencies.actor();
      requireAdmin(actor);
    } catch {
      return new Response("Not found", {status: 404, headers: {"cache-control": "no-store"}});
    }
    let expectedOrigin: string;
    try { expectedOrigin = dependencies.expectedOrigin(); } catch {
      return json(500, {error: "MEDIA_UPLOAD_FAILED"});
    }
    if (!isSameOrigin(request, expectedOrigin)) return json(403, {error: "MEDIA_UPLOAD_FORBIDDEN"});

    try {
      const bytes = await readBoundedBytes(request, MAX_MEDIA_BYTES, {requireContentLength: true});
      const query = new URL(request.url).searchParams;
      const row = await dependencies.upload(actor, {
        bytes,
        contentType: request.headers.get("content-type"),
        fields: {
          filename: query.get("filename"), altEn: query.get("altEn"), altZh: query.get("altZh"),
          focalX: query.get("focalX"), focalY: query.get("focalY"),
        },
      });
      return json(201, {id: row.id, url: row.url});
    } catch (error) {
      if (error instanceof BoundedBodyError || error instanceof MediaUploadValidationError) {
        return json(400, {error: "INVALID_MEDIA_UPLOAD"});
      }
      return json(500, {error: "MEDIA_UPLOAD_FAILED"});
    }
  };
}
