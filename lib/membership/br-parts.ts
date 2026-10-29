import "server-only";

import {DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {z} from "zod";
import {BR_UPLOAD_LIMITS, BR_UPLOAD_PART_BYTES} from "@/config/membership-journey";
import {resolveR2Config} from "@/lib/media/r2-storage";
import {BrDocumentError} from "@/lib/membership/br-document";

export const brUploadReferenceSchema = z.object({
  uploadId: z.string().uuid(),
  partCount: z.coerce.number().int().min(2).max(Math.ceil(BR_UPLOAD_LIMITS.maxBytes / BR_UPLOAD_PART_BYTES)),
  fileName: z.string().min(1).max(180),
});
type Reference = z.infer<typeof brUploadReferenceSchema> & {applicationId: string};
type Command = PutObjectCommand | GetObjectCommand | DeleteObjectCommand;
type Dependencies = {send?: (command: Command) => Promise<unknown>; environment?: Readonly<Record<string, string | undefined>>};

function storage(raw: Reference, dependencies: Dependencies) {
  const reference = brUploadReferenceSchema.parse(raw);
  z.string().uuid().parse(raw.applicationId);
  try {
    const config = resolveR2Config(dependencies.environment ?? process.env);
    const client = new S3Client({endpoint: config.endpoint, region: config.region, credentials: {accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey}});
    return {
      reference,
      bucket: config.bucket,
      key: (index: number) => `membership-br-staging/${raw.applicationId}/${reference.uploadId}/${index}`,
      send: dependencies.send ?? ((command: Command) => client.send(command)),
    };
  } catch {throw new BrDocumentError("BR_STORAGE_FAILED");}
}

/** Caller must authenticate the application owner before any staging read or write. */
export async function stageBusinessRegistrationPart(input: Reference & {partIndex: number; bytes: Uint8Array}, dependencies: Dependencies = {}): Promise<void> {
  const store = storage(input, dependencies);
  const {partCount} = store.reference;
  if (!Number.isInteger(input.partIndex) || input.partIndex < 0 || input.partIndex >= partCount
    || input.bytes.byteLength === 0 || input.bytes.byteLength > BR_UPLOAD_PART_BYTES
    || (input.partIndex < partCount - 1 && input.bytes.byteLength !== BR_UPLOAD_PART_BYTES)
    || input.partIndex * BR_UPLOAD_PART_BYTES + input.bytes.byteLength > BR_UPLOAD_LIMITS.maxBytes) {
    throw new BrDocumentError("BR_TOO_LARGE");
  }
  try {
    const result = await store.send(new PutObjectCommand({Bucket: store.bucket, Key: store.key(input.partIndex), Body: input.bytes, ContentType: "application/octet-stream", CacheControl: "no-store"})) as {ETag?: unknown};
    if (typeof result?.ETag !== "string" || !result.ETag.trim()) throw new Error("ETAG_REQUIRED");
  } catch {throw new BrDocumentError("BR_STORAGE_FAILED");}
}

/** Reassemble only this applicant's bounded objects. Full magic/size/hash validation happens next. */
export async function readBusinessRegistrationParts(input: Reference, dependencies: Dependencies = {}): Promise<{bytes: Uint8Array; cleanup: () => Promise<void>}> {
  const store = storage(input, dependencies);
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (let index = 0; index < store.reference.partCount; index += 1) {
      const result = await store.send(new GetObjectCommand({Bucket: store.bucket, Key: store.key(index)})) as {
        ContentLength?: number; Body?: {transformToByteArray: () => Promise<Uint8Array>};
      };
      if (!result.Body || !result.ContentLength || result.ContentLength > BR_UPLOAD_PART_BYTES) throw new Error("PART_SIZE");
      const bytes = await result.Body.transformToByteArray();
      size += bytes.byteLength;
      if (bytes.byteLength !== result.ContentLength || size > BR_UPLOAD_LIMITS.maxBytes
        || (index < store.reference.partCount - 1 && bytes.byteLength !== BR_UPLOAD_PART_BYTES)) throw new Error("PART_SIZE");
      parts.push(bytes);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {bytes.set(part, offset); offset += part.byteLength;}
    return {bytes, cleanup: async () => {
      // The completed private document is durable before best-effort temporary-object cleanup.
      await Promise.allSettled(parts.map((_, index) => store.send(new DeleteObjectCommand({Bucket: store.bucket, Key: store.key(index)}))));
    }};
  } catch {throw new BrDocumentError("BR_STORAGE_FAILED");}
}
