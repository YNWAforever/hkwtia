import {describe, expect, it, vi} from "vitest";

import {createMemberImportUploadPost} from "@/lib/admin/imports/upload-route";

const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
const member = {kind: "member", userId: "member", profileId: "member"} as const;
function request(origin = "https://wtia.example.test", body = "Email\na@example.test\n") {return new Request("https://wtia.example.test/api/admin/members/import/upload", {method: "POST", headers: {origin, "content-type": "text/csv", "content-length": String(new TextEncoder().encode(body).byteLength)}, body});}

describe("private member import upload route", () => {
  it("authorizes before reading bytes, rejects cross-origin requests, and returns only upload metadata", async () => {
    const upload = vi.fn(async () => ({uploadId: "11111111-1111-4111-8111-111111111111", headers: ["Email"], rowCount: 1}));
    const denied = createMemberImportUploadPost({actor: async () => member, expectedOrigin: () => "https://wtia.example.test", upload});
    expect((await denied(request())).status).toBe(404);
    expect(upload).not.toHaveBeenCalled();
    const post = createMemberImportUploadPost({actor: async () => staff, expectedOrigin: () => "https://wtia.example.test", upload});
    expect((await post(request("https://other.example.test"))).status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
    const response = await post(request());
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({uploadId: "11111111-1111-4111-8111-111111111111", headers: ["Email"], rowCount: 1});
    expect(upload).toHaveBeenCalledWith(staff, expect.objectContaining({format: "csv", bytes: expect.any(Uint8Array)}));
  });
});
