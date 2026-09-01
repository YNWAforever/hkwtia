import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type ServiceOutputTypes,
} from "@aws-sdk/client-s3";

import type {MediaContentType} from "@/lib/media/image-upload";

type Environment = Readonly<Record<string, string | undefined>>;
type Jurisdiction = "default" | "eu" | "us" | "fedramp";

export type R2Config = Readonly<{
  accountId: string;
  jurisdiction: Jurisdiction;
  endpoint: string;
  region: "auto";
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}>;

export class R2StorageError extends Error {
  constructor(readonly reason: "R2_CONFIGURATION_INVALID" | "R2_STORAGE_FAILED" | "R2_ETAG_REQUIRED") {
    super(reason);
    this.name = "R2StorageError";
  }
}

function requiredExact(environment: Environment, name: string): string {
  const value = environment[name];
  if (!value || value.trim() !== value) throw new R2StorageError("R2_CONFIGURATION_INVALID");
  return value;
}

export function resolveR2Config(environment: Environment): R2Config {
  const accountId = requiredExact(environment, "R2_ACCOUNT_ID");
  if (!/^[0-9a-f]{32}$/.test(accountId)) throw new R2StorageError("R2_CONFIGURATION_INVALID");
  const jurisdictionValue = requiredExact(environment, "R2_JURISDICTION");
  if (!["default", "eu", "us", "fedramp"].includes(jurisdictionValue)) {
    throw new R2StorageError("R2_CONFIGURATION_INVALID");
  }
  const jurisdiction = jurisdictionValue as Jurisdiction;
  const accessKeyId = requiredExact(environment, "R2_ACCESS_KEY_ID");
  const secretAccessKey = requiredExact(environment, "R2_SECRET_ACCESS_KEY");
  const bucket = requiredExact(environment, "R2_BUCKET");
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new R2StorageError("R2_CONFIGURATION_INVALID");
  }
  const jurisdictionPart = jurisdiction === "default" ? "" : `.${jurisdiction}`;
  return {
    accountId,
    jurisdiction,
    endpoint: `https://${accountId}${jurisdictionPart}.r2.cloudflarestorage.com`,
    region: "auto",
    accessKeyId,
    secretAccessKey,
    bucket,
  };
}

type Command = PutObjectCommand | DeleteObjectCommand | GetObjectCommand;
type Send = (command: Command) => Promise<ServiceOutputTypes | Record<string, unknown>>;

export type R2Object = Readonly<{
  body: ReadableStream<Uint8Array> | null;
  etag: string | null;
  contentLength: number | null;
  contentType: string | null;
  sha256: string | null;
}>;

export type R2Storage = Readonly<{
  put: (input: Readonly<{
    key: string;
    bytes: Uint8Array;
    contentType: MediaContentType;
    sha256: string;
  }>) => Promise<Readonly<{etag: string}>>;
  delete: (key: string) => Promise<void>;
  get: (input: Readonly<{key: string; etag: string}>) => Promise<R2Object>;
}>;

function webStream(value: unknown): ReadableStream<Uint8Array> | null {
  if (!value) return null;
  if (value instanceof ReadableStream) return value as ReadableStream<Uint8Array>;
  const sdkBody = value as {transformToWebStream?: () => ReadableStream<Uint8Array>};
  if (typeof sdkBody.transformToWebStream === "function") return sdkBody.transformToWebStream();
  const iteratorFactory = (value as {[Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array>})[Symbol.asyncIterator];
  if (typeof iteratorFactory !== "function") return null;
  const iterator = iteratorFactory.call(value);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const result = await iterator.next();
      if (result.done) controller.close();
      else controller.enqueue(result.value);
    },
    async cancel() { await iterator.return?.(); },
  });
}

type R2StorageOptions = Readonly<{
  environment?: Environment;
  send?: Send;
}>;

export function createR2Storage(options: R2StorageOptions = {}): R2Storage {
  const environment = options.environment ?? process.env;
  let productionSend: Send | null = null;
  function connection(): Readonly<{config: R2Config; send: Send}> {
    const config = resolveR2Config(environment);
    if (options.send) return {config, send: options.send};
    if (!productionSend) {
      const client = new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        credentials: {accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey},
      });
      productionSend = (command) => client.send(command as never);
    }
    return {config, send: productionSend};
  }

  return {
    async put(input) {
      const {config, send} = connection();
      let output: ServiceOutputTypes | Record<string, unknown>;
      try {
        output = await send(new PutObjectCommand({
          Bucket: config.bucket,
          Key: input.key,
          Body: input.bytes,
          ContentType: input.contentType,
          CacheControl: "no-store",
          Metadata: {sha256: input.sha256},
        }));
      } catch {
        throw new R2StorageError("R2_STORAGE_FAILED");
      }
      const etag = (output as {ETag?: unknown}).ETag;
      if (typeof etag !== "string" || etag.trim() === "") {
        throw new R2StorageError("R2_ETAG_REQUIRED");
      }
      return {etag};
    },
    async delete(key) {
      const {config, send} = connection();
      try {
        await send(new DeleteObjectCommand({Bucket: config.bucket, Key: key}));
      } catch {
        throw new R2StorageError("R2_STORAGE_FAILED");
      }
    },
    async get(input) {
      const {config, send} = connection();
      let output: ServiceOutputTypes | Record<string, unknown>;
      try {
        output = await send(new GetObjectCommand({
          Bucket: config.bucket,
          Key: input.key,
          IfMatch: input.etag,
        }));
      } catch {
        throw new R2StorageError("R2_STORAGE_FAILED");
      }
      const value = output as {
        Body?: unknown;
        ETag?: unknown;
        ContentLength?: unknown;
        ContentType?: unknown;
        Metadata?: Readonly<Record<string, string>>;
      };
      return {
        body: webStream(value.Body),
        etag: typeof value.ETag === "string" ? value.ETag : null,
        contentLength: typeof value.ContentLength === "number" ? value.ContentLength : null,
        contentType: typeof value.ContentType === "string" ? value.ContentType : null,
        sha256: value.Metadata?.sha256 ?? null,
      };
    },
  };
}

export const privateR2Storage = createR2Storage();
