import {describe, expect, it, vi} from "vitest";

import {BoundedBodyError, readBoundedText} from "@/lib/security/bounded-body";

function streamed(chunks: readonly string[], onCancel?: () => void): Request {
  const encoder = new TextEncoder();
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[index] as string));
      index += 1;
    },
    cancel() {
      onCancel?.();
    },
  });
  return new Request("https://hkwtia.test/x", {
    method: "POST",
    body,
    // @ts-expect-error -- duplex is required for a streaming body and is not in the DOM types.
    duplex: "half",
  });
}

function sized(body: string, declared?: string): Request {
  return new Request("https://hkwtia.test/x", {
    method: "POST",
    headers: declared === undefined ? {} : {"content-length": declared},
    body,
  });
}

describe("readBoundedText", () => {
  it.each([
    ["under the cap", "hello", 64],
    ["exactly at the cap", "12345", 5],
    ["an empty body", "", 8],
  ])("accepts %s", async (_case, body, cap) => {
    await expect(readBoundedText(sized(body), cap)).resolves.toBe(body);
  });

  it.each([
    ["one byte over", "123456", 5],
    ["far over", "x".repeat(5_000), 1_024],
  ])("rejects %s", async (_case, body, cap) => {
    await expect(readBoundedText(sized(body), cap)).rejects.toThrow(BoundedBodyError);
  });

  it("rejects a header that declares more than the cap before reading anything", async () => {
    await expect(readBoundedText(sized("tiny", "999999"), 1_024)).rejects.toMatchObject({
      reason: "TOO_LARGE",
    });
  });

  it.each([["negative", "-1"], ["not a number", "abc"]])(
    "rejects a %s content-length rather than ignoring it",
    async (_case, declared) => {
      await expect(readBoundedText(sized("x", declared), 1_024)).rejects.toThrow(BoundedBodyError);
    },
  );

  // This is the assertion that distinguishes a real streaming cap from a
  // read-then-measure one: a buffering implementation passes every test above
  // while having already allocated the whole body.
  it("cancels the stream instead of buffering the rest", async () => {
    const cancel = vi.fn();
    const request = streamed(["a".repeat(600), "b".repeat(600), "c".repeat(600)], cancel);

    await expect(readBoundedText(request, 1_000)).rejects.toMatchObject({reason: "TOO_LARGE"});
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("enforces the cap when no content-length is declared at all", async () => {
    const request = streamed(["x".repeat(2_000)]);

    await expect(readBoundedText(request, 1_000)).rejects.toMatchObject({reason: "TOO_LARGE"});
  });

  it("rejects invalid UTF-8 distinctly from an oversize body", async () => {
    const request = new Request("https://hkwtia.test/x", {
      method: "POST",
      body: new Uint8Array([0xff, 0xfe, 0xfd]),
    });

    await expect(readBoundedText(request, 1_024)).rejects.toMatchObject({
      reason: "INVALID_ENCODING",
    });
  });
});
