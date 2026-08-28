import {describe, expect, it} from "vitest";

import {BoundedBodyError, readBoundedBytes} from "@/lib/security/bounded-body";

const CAP = 4_194_304;

function request(body: Uint8Array | null, length?: string) {
  return new Request("https://www.hkwtia.org/api/admin/media/upload", {
    method: "POST",
    headers: length === undefined ? undefined : {"content-length": length},
    body,
    duplex: "half",
  } as RequestInit);
}

describe("strict bounded raw request reader", () => {
  it.each([undefined, "", "abc", "1.5", "0", "-1", String(CAP + 1)])(
    "rejects absent, malformed, empty, or excessive content-length %s before reading",
    async (length) => {
      const body = new ReadableStream<Uint8Array>({
        pull() { throw new Error("BODY_READ_BEFORE_LENGTH_VALIDATION"); },
      });
      const input = new Request("https://www.hkwtia.org/api/admin/media/upload", {
        method: "POST",
        headers: length === undefined ? undefined : {"content-length": length},
        body,
        duplex: "half",
      } as RequestInit);

      await expect(readBoundedBytes(input, CAP, {requireContentLength: true}))
        .rejects.toBeInstanceOf(BoundedBodyError);
    },
  );

  it("accepts exactly 4 MiB", async () => {
    const bytes = new Uint8Array(CAP);
    await expect(readBoundedBytes(request(bytes, String(CAP)), CAP, {requireContentLength: true}))
      .resolves.toHaveLength(CAP);
  });

  it("enforces the streaming cap when content-length lies", async () => {
    const bytes = new Uint8Array(CAP + 1);
    await expect(readBoundedBytes(request(bytes, "1"), CAP, {requireContentLength: true}))
      .rejects.toMatchObject({reason: "TOO_LARGE"});
  });

  it("rejects a shorter stream than its declared length", async () => {
    await expect(readBoundedBytes(request(new Uint8Array([1, 2]), "3"), CAP, {
      requireContentLength: true,
    })).rejects.toMatchObject({reason: "LENGTH_MISMATCH"});
  });
});
