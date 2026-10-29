import {describe, expect, it} from "vitest";

import {inspectBusinessRegistration, storeBusinessRegistration, BrDocumentError} from "@/lib/membership/br-document";

const APPLICATION = "10000000-0000-4000-8000-000000000001";
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

describe("business registration upload", () => {
  it("accepts a PDF by magic bytes and ignores a misleading name", () => {
    const inspected = inspectBusinessRegistration("../notes.html", pdf);
    expect(inspected.contentType).toBe("application/pdf");
    expect(inspected.fileName).toBe("notes.html");
    expect(inspected.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a file that is not a PDF or image", () => {
    expect(() => inspectBusinessRegistration("notes.txt", new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c]))).toThrow(BrDocumentError);
  });

  it("records a pending provider when R2 is not configured and does not call put", async () => {
    let puts = 0;
    const stored = await storeBusinessRegistration(
      {applicationId: APPLICATION, fileName: "br.pdf", bytes: pdf},
      {providerConfigured: false, put: async () => { puts += 1; return {etag: "nope"}; }},
    );
    expect(puts).toBe(0);
    expect(stored).toMatchObject({status: "pending_provider", key: null, contentType: "application/pdf"});
  });

  it("refuses to discard registration bytes in production outside Vercel", async () => {
    await expect(storeBusinessRegistration(
      {applicationId: APPLICATION, fileName: "br.pdf", bytes: pdf},
      {providerConfigured: false, environment: {NODE_ENV: "production"}},
    )).rejects.toThrow("BR_STORAGE_FAILED");
  });

  it("stores under the application id when the provider is configured", async () => {
    const stored = await storeBusinessRegistration(
      {applicationId: APPLICATION, fileName: "br.pdf", bytes: pdf},
      {providerConfigured: true, put: async (input) => ({etag: input.key})},
    );
    expect(stored.status).toBe("stored");
    expect(stored.key).toBe(`membership-br/${APPLICATION}/${stored.sha256}`);
  });
});
