import {describe, expect, it, vi} from "vitest";

import {uploadMemberImport, validateMemberImport, confirmMemberImport, type ImportGateway} from "@/lib/admin/imports/service";

const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
const member = {kind: "member", userId: "member", profileId: "member"} as const;
const id = "11111111-1111-4111-8111-111111111111";
const store = {upload: vi.fn(async () => ({uploadId: id, headers: ["Email"], rowCount: 1})), validate: vi.fn(async () => ({runId: id, state: "validated", total: 1, create: 1, update: 0, unchanged: 0, duplicate: 0, conflict: 0, invalid: 0})), confirm: vi.fn(async () => ({runId: id, state: "confirmed", total: 1, create: 1, update: 0, unchanged: 0, duplicate: 0, conflict: 0, invalid: 0}))};

describe("member import actor and payload boundary", () => {
  it("authorizes before parsing bytes and rejects forged actors or privileged mappings", async () => {
    vi.stubEnv("MEMBER_IMPORT_ENABLED", "true");
    try {
      await expect(uploadMemberImport(member, {bytes: new Uint8Array([1]), format: "csv"}, store as ImportGateway)).rejects.toThrow("FORBIDDEN");
      await expect(validateMemberImport(staff, {uploadId: id, mapping: {email: "Email", role: "superadmin"}}, store as ImportGateway)).rejects.toThrow();
      expect(store.upload).not.toHaveBeenCalled();
      expect(store.validate).not.toHaveBeenCalled();
      expect(await uploadMemberImport(staff, {bytes: new TextEncoder().encode("Email\na@example.test\n"), format: "csv"}, store as ImportGateway)).toMatchObject({uploadId: id});
      expect(await validateMemberImport(staff, {uploadId: id, mapping: {email: "Email"}}, store as ImportGateway)).toMatchObject({create: 1});
      expect(await confirmMemberImport(staff, {runId: id, rowNumbers: [2]}, store as ImportGateway)).toMatchObject({state: "confirmed"});
    } finally {vi.unstubAllEnvs();}
  });

  it("leaves imports disabled unless explicitly flagged", async () => {
    vi.stubEnv("MEMBER_IMPORT_ENABLED", "");
    try {await expect(uploadMemberImport(staff, {bytes: new Uint8Array([1]), format: "csv"}, store as ImportGateway)).rejects.toThrow("IMPORT_DISABLED");}
    finally {vi.unstubAllEnvs();}
  });
});
