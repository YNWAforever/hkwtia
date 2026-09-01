import "server-only";

import {createHash} from "node:crypto";

import type {UploadedMediaRow} from "@/lib/db/repos/media";
import {MAX_MEDIA_BYTES} from "@/lib/media/image-upload";
import type {R2Storage} from "@/lib/media/r2-storage";
import {readBoundedBytes} from "@/lib/security/bounded-body";

type Context = Readonly<{params: Promise<{id: string}>}>;
type Dependencies = Readonly<{
  load: (id: unknown) => Promise<UploadedMediaRow | null>;
  storage: Pick<R2Storage, "get">;
}>;

function notFoundResponse() {
  return new Response("Not found", {status: 404, headers: {"cache-control": "no-store"}});
}

function stream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({start(controller) { controller.enqueue(bytes); controller.close(); }});
}

export function createMediaGet(dependencies: Dependencies) {
  return async function get(_request: Request, context: Context): Promise<Response> {
    try {
      const {id} = await context.params;
      const row = await dependencies.load(id);
      if (!row) return notFoundResponse();
      const object = await dependencies.storage.get({key: row.storageKey, etag: row.storageEtag});
      if (!object.body || object.etag !== row.storageEtag || object.contentLength !== row.byteSize
        || object.contentType !== row.contentType || object.sha256 !== row.checksumSha256
        || row.byteSize > MAX_MEDIA_BYTES) return notFoundResponse();

      const bodyRequest = new Request("https://media-body.invalid", {
        method: "POST", headers: {"content-length": String(row.byteSize)}, body: object.body,
        duplex: "half",
      } as RequestInit);
      const bytes = await readBoundedBytes(bodyRequest, MAX_MEDIA_BYTES, {requireContentLength: true});
      if (createHash("sha256").update(bytes).digest("hex") !== row.checksumSha256) {
        return notFoundResponse();
      }
      return new Response(stream(bytes), {status: 200, headers: {
        "Cache-Control": "no-store", "Content-Disposition": "inline",
        "Content-Length": String(row.byteSize), "Content-Type": row.contentType,
        ETag: row.storageEtag, "X-Content-Type-Options": "nosniff",
      }});
    } catch {
      return notFoundResponse();
    }
  };
}
