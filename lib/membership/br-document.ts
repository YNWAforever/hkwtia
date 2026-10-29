import "server-only";

import {createHash} from "node:crypto";

import {PutObjectCommand, S3Client} from "@aws-sdk/client-s3";

import {BR_UPLOAD_LIMITS, type BrContentType} from "@/config/membership-journey";
import {R2StorageError, resolveR2Config} from "@/lib/media/r2-storage";

const MAGIC: Record<BrContentType, readonly number[]> = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47],
};

export type StoredBusinessRegistration = Readonly<{
  status: "stored" | "pending_provider";
  key: string | null;
  sha256: string;
  byteSize: number;
  contentType: BrContentType;
  fileName: string;
}>;

export class BrDocumentError extends Error {
  constructor(readonly code: "BR_REQUIRED" | "BR_TOO_LARGE" | "BR_TYPE" | "BR_STORAGE_FAILED") {
    super(code);
    this.name = "BrDocumentError";
  }
}

type PutDocument = (input: Readonly<{
  key: string;
  bytes: Uint8Array;
  contentType: BrContentType;
  sha256: string;
}>) => Promise<{etag: string}>;

function safeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop()?.replace(/[^\w.\- ()]/g, "") ?? "";
  const trimmed = base.trim().slice(0, 180);
  if (!trimmed || trimmed === "." || trimmed === "..") throw new BrDocumentError("BR_TYPE");
  return trimmed;
}

function detectType(bytes: Uint8Array): BrContentType | null {
  for (const type of BR_UPLOAD_LIMITS.contentTypes) {
    const magic = MAGIC[type];
    if (bytes.byteLength >= magic.length && magic.every((byte, index) => bytes[index] === byte)) return type;
  }
  return null;
}

/** Declared Content-Type is ignored. The bytes decide, so a renamed HTML file cannot pass as a PDF. */
export function inspectBusinessRegistration(fileName: string, bytes: Uint8Array): Omit<StoredBusinessRegistration, "status" | "key"> {
  if (bytes.byteLength === 0) throw new BrDocumentError("BR_REQUIRED");
  if (bytes.byteLength > BR_UPLOAD_LIMITS.maxBytes) throw new BrDocumentError("BR_TOO_LARGE");
  const contentType = detectType(bytes);
  if (!contentType) throw new BrDocumentError("BR_TYPE");
  return {
    fileName: safeFileName(fileName),
    contentType,
    byteSize: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function providerConfigured(environment: NodeJS.ProcessEnv): boolean {
  try {
    resolveR2Config(environment);
    return true;
  } catch (error) {
    if (error instanceof R2StorageError && error.reason === "R2_CONFIGURATION_INVALID") return false;
    return false;
  }
}

async function putWithR2(input: Parameters<PutDocument>[0]): Promise<{etag: string}> {
  const config = resolveR2Config(process.env);
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey},
  });
  let etag: unknown;
  try {
    const output = await client.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: input.key,
      Body: input.bytes,
      ContentType: input.contentType,
      CacheControl: "no-store",
      Metadata: {sha256: input.sha256},
    }));
    etag = output.ETag;
  } catch {
    throw new BrDocumentError("BR_STORAGE_FAILED");
  }
  if (typeof etag !== "string" || etag.trim() === "") throw new BrDocumentError("BR_STORAGE_FAILED");
  return {etag};
}

/**
 * Private R2, same bucket configuration as member images, but without the image
 * normaliser: a Business Registration is a PDF or a scan, not a hero.
 * When R2 is not configured the bytes are not kept. The caller records
 * `pending_provider` and, in production, refuses to finish the application.
 */
export async function storeBusinessRegistration(
  input: Readonly<{applicationId: string; fileName: string; bytes: Uint8Array}>,
  dependencies: Readonly<{put?: PutDocument; providerConfigured?: boolean; environment?: NodeJS.ProcessEnv}> = {},
): Promise<StoredBusinessRegistration> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.applicationId)) {
    throw new BrDocumentError("BR_TYPE");
  }
  const inspected = inspectBusinessRegistration(input.fileName, input.bytes);
  const configured = dependencies.providerConfigured ?? providerConfigured(dependencies.environment ?? process.env);
  if (!configured) return {status: "pending_provider", key: null, ...inspected};
  const key = `membership-br/${input.applicationId}/${inspected.sha256}`;
  await (dependencies.put ?? putWithR2)({key, bytes: input.bytes, contentType: inspected.contentType, sha256: inspected.sha256});
  return {status: "stored", key, ...inspected};
}
