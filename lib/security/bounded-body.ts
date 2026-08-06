export type BoundedBodyReason = "TOO_LARGE" | "INVALID_ENCODING";

export class BoundedBodyError extends Error {
  constructor(readonly reason: BoundedBodyReason) {
    super(reason);
    this.name = "BoundedBodyError";
  }
}

/**
 * Reads a request body as text, refusing anything over `maxBytes`.
 *
 * `content-length` is checked when present but never trusted: the running total
 * is enforced chunk by chunk and the reader is cancelled the moment it is
 * exceeded, so a body that lies about its length — or omits the header — still
 * cannot be buffered past the cap. That distinction is the whole point; a
 * read-then-measure implementation has already allocated the memory by the time
 * it notices.
 *
 * Extracted from the job worker-alert reader, which was the only correct
 * implementation in the repo.
 */
export async function readBoundedText(request: Request, maxBytes: number): Promise<string> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const bytes = Number(declared);
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new BoundedBodyError("TOO_LARGE");
    if (bytes > maxBytes) throw new BoundedBodyError("TOO_LARGE");
  }

  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > maxBytes) {
      await reader.cancel();
      throw new BoundedBodyError("TOO_LARGE");
    }
    chunks.push(chunk.value);
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", {fatal: true}).decode(bytes);
  } catch {
    throw new BoundedBodyError("INVALID_ENCODING");
  }
}
