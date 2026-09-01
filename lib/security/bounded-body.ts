export type BoundedBodyReason =
  | "TOO_LARGE"
  | "INVALID_ENCODING"
  | "INVALID_LENGTH"
  | "LENGTH_MISMATCH";

export class BoundedBodyError extends Error {
  constructor(readonly reason: BoundedBodyReason) {
    super(reason);
    this.name = "BoundedBodyError";
  }
}

type ReadBoundedBytesOptions = Readonly<{
  /** Uploads require a positive, exact Content-Length before the stream is touched. */
  requireContentLength?: boolean;
}>;

export async function readBoundedBytes(
  request: Request,
  maxBytes: number,
  options: ReadBoundedBytesOptions = {},
): Promise<Uint8Array> {
  const declaredHeader = request.headers.get("content-length");
  let declaredLength: number | null = null;
  if (declaredHeader !== null) {
    if (!/^\d+$/.test(declaredHeader)) throw new BoundedBodyError("INVALID_LENGTH");
    declaredLength = Number(declaredHeader);
    if (!Number.isSafeInteger(declaredLength)) throw new BoundedBodyError("INVALID_LENGTH");
    if (declaredLength > maxBytes) throw new BoundedBodyError("TOO_LARGE");
  }
  if (options.requireContentLength && (declaredLength === null || declaredLength === 0)) {
    throw new BoundedBodyError("INVALID_LENGTH");
  }

  if (!request.body) {
    if (declaredLength && declaredLength > 0) throw new BoundedBodyError("LENGTH_MISMATCH");
    return new Uint8Array();
  }
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
  if (declaredLength !== null && length !== declaredLength) {
    throw new BoundedBodyError("LENGTH_MISMATCH");
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Reads UTF-8 text without buffering more than `maxBytes`. */
export async function readBoundedText(request: Request, maxBytes: number): Promise<string> {
  let bytes: Uint8Array;
  try {
    bytes = await readBoundedBytes(request, maxBytes);
  } catch (error) {
    // Preserve the existing text-reader error contract.
    if (error instanceof BoundedBodyError && error.reason === "INVALID_LENGTH") {
      throw new BoundedBodyError("TOO_LARGE");
    }
    throw error;
  }
  try {
    return new TextDecoder("utf-8", {fatal: true}).decode(bytes);
  } catch {
    throw new BoundedBodyError("INVALID_ENCODING");
  }
}
