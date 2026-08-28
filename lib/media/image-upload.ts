import "server-only";

import {createHash, randomUUID} from "node:crypto";

import sharp from "sharp";

export const MAX_MEDIA_BYTES = 4_194_304;
export const MAX_MEDIA_PIXELS = 40_000_000;
export const MAX_MEDIA_DIMENSION = 10_000;

export const mediaContentTypes = ["image/png", "image/jpeg", "image/webp"] as const;
export type MediaContentType = typeof mediaContentTypes[number];

type ImageUploadFieldsInput = Readonly<{
  filename: unknown;
  altEn: unknown;
  altZh: unknown;
  focalX: unknown;
  focalY: unknown;
}>;

export type ImageUploadFields = Readonly<{
  filename: string;
  altEn: string;
  altZh: string;
  focalX: number;
  focalY: number;
}>;

export type NormalizedImageUpload = ImageUploadFields & Readonly<{
  bytes: Buffer;
  contentType: MediaContentType;
  width: number;
  height: number;
  byteSize: number;
  sha256: string;
  objectKey: string;
}>;

export class MediaUploadValidationError extends Error {
  constructor(readonly reason: "MEDIA_UPLOAD_FIELDS_INVALID" | "MEDIA_IMAGE_INVALID") {
    super(reason);
    this.name = "MediaUploadValidationError";
  }
}

const forbiddenText = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

function exactCanonicalText(value: unknown, max: number, forbidPaths: boolean): string {
  if (typeof value !== "string") throw new MediaUploadValidationError("MEDIA_UPLOAD_FIELDS_INVALID");
  if (value !== value.trim() || value !== value.normalize("NFC")) {
    throw new MediaUploadValidationError("MEDIA_UPLOAD_FIELDS_INVALID");
  }
  const length = Array.from(value).length;
  if (length < 1 || length > max || forbiddenText.test(value)) {
    throw new MediaUploadValidationError("MEDIA_UPLOAD_FIELDS_INVALID");
  }
  if (forbidPaths && (value.includes("/") || value.includes("\\"))) {
    throw new MediaUploadValidationError("MEDIA_UPLOAD_FIELDS_INVALID");
  }
  return value;
}

function focal(value: unknown): number {
  if (typeof value !== "string" || value === "" || value.trim() !== value) {
    throw new MediaUploadValidationError("MEDIA_UPLOAD_FIELDS_INVALID");
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
    throw new MediaUploadValidationError("MEDIA_UPLOAD_FIELDS_INVALID");
  }
  return parsed;
}

export function validateImageUploadFields(input: ImageUploadFieldsInput): ImageUploadFields {
  return {
    filename: exactCanonicalText(input.filename, 255, true),
    altEn: exactCanonicalText(input.altEn, 300, false),
    altZh: exactCanonicalText(input.altZh, 300, false),
    focalX: focal(input.focalX),
    focalY: focal(input.focalY),
  };
}

function bytesMatch(bytes: Uint8Array, expected: readonly number[], offset = 0): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function hasMagic(bytes: Uint8Array, contentType: MediaContentType): boolean {
  if (contentType === "image/png") {
    return bytesMatch(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (contentType === "image/jpeg") return bytesMatch(bytes, [0xff, 0xd8, 0xff]);
  return bytesMatch(bytes, [0x52, 0x49, 0x46, 0x46])
    && bytesMatch(bytes, [0x57, 0x45, 0x42, 0x50], 8);
}

function parseContentType(value: unknown): MediaContentType {
  if (typeof value !== "string" || !mediaContentTypes.includes(value as MediaContentType)) {
    throw new MediaUploadValidationError("MEDIA_IMAGE_INVALID");
  }
  return value as MediaContentType;
}

function extension(contentType: MediaContentType): "png" | "jpg" | "webp" {
  return contentType === "image/jpeg" ? "jpg" : contentType.slice("image/".length) as "png" | "webp";
}

type NormalizationDependencies = Readonly<{
  now?: () => Date;
  uuid?: () => string;
  encode?: (
    pipeline: ReturnType<typeof sharp>,
    contentType: MediaContentType,
  ) => Promise<Readonly<{data: Buffer; info: Readonly<{width: number; height: number}>}>>;
}>;

export async function normalizeImageUpload(
  input: Uint8Array,
  declaredContentType: unknown,
  fieldInput: ImageUploadFieldsInput,
  dependencies: NormalizationDependencies = {},
): Promise<NormalizedImageUpload> {
  const fields = validateImageUploadFields(fieldInput);
  const contentType = parseContentType(declaredContentType);
  if (input.byteLength < 1 || input.byteLength > MAX_MEDIA_BYTES || !hasMagic(input, contentType)) {
    throw new MediaUploadValidationError("MEDIA_IMAGE_INVALID");
  }

  try {
    const source = sharp(input, {
      animated: true,
      failOn: "warning",
      limitInputPixels: MAX_MEDIA_PIXELS,
      sequentialRead: true,
    });
    const metadata = await source.metadata();
    const pages = metadata.pages ?? 1;
    if (
      pages !== 1
      || !metadata.width
      || !metadata.height
      || metadata.width < 1
      || metadata.height < 1
      || metadata.width > MAX_MEDIA_DIMENSION
      || metadata.height > MAX_MEDIA_DIMENSION
      || metadata.width * metadata.height > MAX_MEDIA_PIXELS
    ) {
      throw new MediaUploadValidationError("MEDIA_IMAGE_INVALID");
    }

    let pipeline = source.rotate();
    if (contentType === "image/png") pipeline = pipeline.png();
    else if (contentType === "image/jpeg") pipeline = pipeline.jpeg();
    else pipeline = pipeline.webp();
    const normalized = dependencies.encode
      ? await dependencies.encode(pipeline, contentType)
      : await pipeline.toBuffer({resolveWithObject: true});
    const bytes = normalized.data;
    if (
      bytes.byteLength < 1
      || bytes.byteLength > MAX_MEDIA_BYTES
      || normalized.info.width < 1
      || normalized.info.height < 1
      || normalized.info.width > MAX_MEDIA_DIMENSION
      || normalized.info.height > MAX_MEDIA_DIMENSION
      || normalized.info.width * normalized.info.height > MAX_MEDIA_PIXELS
      || !hasMagic(bytes, contentType)
    ) {
      throw new MediaUploadValidationError("MEDIA_IMAGE_INVALID");
    }

    const now = (dependencies.now ?? (() => new Date()))();
    if (Number.isNaN(now.getTime())) throw new MediaUploadValidationError("MEDIA_IMAGE_INVALID");
    const id = (dependencies.uuid ?? randomUUID)();
    const year = String(now.getUTCFullYear()).padStart(4, "0");
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    return {
      ...fields,
      bytes,
      contentType,
      width: normalized.info.width,
      height: normalized.info.height,
      byteSize: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      objectKey: `media/${year}/${month}/${id}.${extension(contentType)}`,
    };
  } catch (error) {
    if (error instanceof MediaUploadValidationError) throw error;
    throw new MediaUploadValidationError("MEDIA_IMAGE_INVALID");
  }
}
