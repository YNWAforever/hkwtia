import {describe, expect, it, vi} from "vitest";
import {DeleteObjectCommand, GetObjectCommand, PutObjectCommand} from "@aws-sdk/client-s3";
import {readBusinessRegistrationParts, stageBusinessRegistrationPart} from "@/lib/membership/br-parts";
import {inspectBusinessRegistration} from "@/lib/membership/br-document";
import {BR_UPLOAD_LIMITS, BR_UPLOAD_PART_BYTES} from "@/config/membership-journey";

const reference = {applicationId: "10000000-0000-4000-8000-000000000001", uploadId: "10000000-0000-4000-8000-000000000002", partCount: 3, fileName: "br.pdf"};
const environment = {R2_ACCOUNT_ID: "a".repeat(32), R2_JURISDICTION: "default", R2_ACCESS_KEY_ID: "test-id", R2_SECRET_ACCESS_KEY: "test-secret", R2_BUCKET: "private-test"};
type Command = PutObjectCommand | GetObjectCommand | DeleteObjectCommand;
function storage() {
  const objects = new Map<string, Uint8Array>();
  const send = vi.fn(async (command: Command) => {
    const key = command.input.Key!;
    if (command instanceof PutObjectCommand) {objects.set(key, command.input.Body as Uint8Array); return {ETag: '"test"'};}
    if (command instanceof DeleteObjectCommand) {objects.delete(key); return {};}
    const bytes = objects.get(key);
    if (!bytes) throw new Error("NOT_FOUND");
    return {ContentLength: bytes.byteLength, Body: {transformToByteArray: async () => bytes}};
  });
  return {objects, send, environment};
}

describe("private BR staging", () => {
  it("reassembles the full 8 MB document exactly and removes only its own temporary parts", async () => {
    const deps = storage();
    const bytes = new Uint8Array(BR_UPLOAD_LIMITS.maxBytes);
    bytes.set([0x25, 0x50, 0x44, 0x46]); bytes[bytes.length - 1] = 77;
    for (let index = 0; index < 3; index += 1) await stageBusinessRegistrationPart({...reference, partIndex: index, bytes: bytes.slice(index * BR_UPLOAD_PART_BYTES, (index + 1) * BR_UPLOAD_PART_BYTES)}, deps);
    expect(deps.objects.size).toBe(3);
    expect([...deps.objects.keys()].every(key => key.startsWith(`membership-br-staging/${reference.applicationId}/${reference.uploadId}/`))).toBe(true);
    const staged = await readBusinessRegistrationParts(reference, deps);
    expect(inspectBusinessRegistration(reference.fileName, staged.bytes).sha256).toBe(inspectBusinessRegistration(reference.fileName, bytes).sha256);
    expect(inspectBusinessRegistration(reference.fileName, staged.bytes)).toMatchObject({contentType: "application/pdf", byteSize: BR_UPLOAD_LIMITS.maxBytes});
    await staged.cleanup();
    expect(deps.objects.size).toBe(0);
  });

  it.each([-1, 3, 0.5, NaN])("rejects hostile part index %s before storage", async (partIndex) => {
    const deps = storage();
    await expect(stageBusinessRegistrationPart({...reference, partIndex, bytes: new Uint8Array(BR_UPLOAD_PART_BYTES)}, deps)).rejects.toThrow("BR_TOO_LARGE");
    expect(deps.send).not.toHaveBeenCalled();
  });

  it("rejects oversized, empty, and short non-final parts before storage", async () => {
    const deps = storage();
    for (const size of [0, 20, BR_UPLOAD_PART_BYTES + 1]) await expect(stageBusinessRegistrationPart({...reference, partIndex: 0, bytes: new Uint8Array(size)}, deps)).rejects.toThrow("BR_TOO_LARGE");
    expect(deps.send).not.toHaveBeenCalled();
  });

  it("never reads a different application's objects", async () => {
    const deps = storage();
    await stageBusinessRegistrationPart({...reference, partIndex: 0, bytes: new Uint8Array(BR_UPLOAD_PART_BYTES)}, deps);
    await expect(readBusinessRegistrationParts({...reference, applicationId: "10000000-0000-4000-8000-000000000003"}, deps)).rejects.toThrow("BR_STORAGE_FAILED");
    expect(deps.objects.size).toBe(1);
  });

  it("fails closed for missing R2, missing parts and incomplete provider responses", async () => {
    await expect(stageBusinessRegistrationPart({...reference, partIndex: 0, bytes: new Uint8Array(BR_UPLOAD_PART_BYTES)}, {environment: {}})).rejects.toThrow("BR_STORAGE_FAILED");
    await expect(readBusinessRegistrationParts(reference, storage())).rejects.toThrow("BR_STORAGE_FAILED");
    await expect(stageBusinessRegistrationPart({...reference, partIndex: 0, bytes: new Uint8Array(BR_UPLOAD_PART_BYTES)}, {environment, send: async () => ({})})).rejects.toThrow("BR_STORAGE_FAILED");
  });
});
