import "server-only";

import {createHash} from "node:crypto";

import sharp from "sharp";

import type {UploadedMediaRow} from "@/lib/db/repos/media";
import {MAX_MEDIA_BYTES} from "@/lib/media/image-upload";
import type {R2Storage} from "@/lib/media/r2-storage";
import {MEDIA_DELIVERY_WIDTHS, type MediaDeliveryWidth} from "@/lib/media/url";
import {readBoundedBytes} from "@/lib/security/bounded-body";

const RESIZABLE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const CDN_CACHE = "public, max-age=0, s-maxage=300, must-revalidate";

/**
 * `?w=` from the fixed list, `null` for none, or `false` for anything else — a duplicate, an
 * unlisted number, text. Partner logos were 155KB, 960px PNGs drawn ~160px wide (round 22); the
 * route resizes them itself so a resized copy passes the same lookup, archive check and sha256
 * verification as the original, instead of going through Next's optimizer.
 */
function requestedWidth(request: Request): MediaDeliveryWidth | null | false {
  const values = new URL(request.url).searchParams.getAll("w");
  if (values.length === 0) return null;
  if (values.length > 1 || !/^\d+$/.test(values[0])) return false;
  const width = Number(values[0]);
  return (MEDIA_DELIVERY_WIDTHS as readonly number[]).includes(width) ? (width as MediaDeliveryWidth) : false;
}

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
  return async function get(request: Request, context: Context): Promise<Response> {
    try {
      const width = requestedWidth(request);
      if (width === false) return notFoundResponse();
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
      if (width !== null && RESIZABLE_TYPES.has(row.contentType)) {
        // limitInputPixels bounds what a crafted upload could make this decode.
        const resized = await sharp(bytes, {limitInputPixels: 40_000_000})
          .resize({width, withoutEnlargement: true})
          .webp({quality: 82})
          .toBuffer();
        return new Response(stream(new Uint8Array(resized)), {status: 200, headers: {
          "Cache-Control": CDN_CACHE, "Content-Disposition": "inline",
          "Content-Length": String(resized.length), "Content-Type": "image/webp",
          ETag: `"${row.storageEtag.replace(/"/g, "")}-w${width}"`, "X-Content-Type-Options": "nosniff",
        }});
      }
      // Verified bytes may sit in Vercel's CDN for 5 minutes; browsers always revalidate. no-store
      // made every partner logo a 1-2.4s function call (round 21). The owner accepted (2026-10-09)
      // that an archived item can be served for at most those 5 minutes; every not-found answer,
      // archived media included, stays no-store above.
      return new Response(stream(bytes), {status: 200, headers: {
        "Cache-Control": CDN_CACHE, "Content-Disposition": "inline",
        "Content-Length": String(row.byteSize), "Content-Type": row.contentType,
        ETag: row.storageEtag, "X-Content-Type-Options": "nosniff",
      }});
    } catch {
      return notFoundResponse();
    }
  };
}
