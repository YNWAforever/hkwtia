import {createHash} from "node:crypto";
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {MediaUploadForm} from "@/components/admin/media-upload-form";
import {validateImageUploadFields} from "@/lib/media/image-upload";
import {createMediaGet} from "@/lib/media/media-delivery-route";
import {resolveR2Config} from "@/lib/media/r2-storage";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({useRouter: () => ({refresh})}));
const fields = {filename: "partner-logo.png", altEn: "Partner logo", altZh: "合作夥伴標誌", focalX: "50", focalY: "50"};
const environment = {R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef", R2_JURISDICTION: "default", R2_ACCESS_KEY_ID: "access-key", R2_SECRET_ACCESS_KEY: "secret-key", R2_BUCKET: "private-media"};
const labels = {title: "Upload", description: "Private", file: "Image file", fileHelp: "Help", altEn: "English alt", altZh: "Chinese alt", altHelp: "Alt help", focalX: "Focal X", focalY: "Focal Y", upload: "Upload image", uploading: "Uploading", success: "Uploaded", invalid: "Invalid", error: "Error"};

describe("media review hardening contracts", () => {
  beforeEach(() => { vi.restoreAllMocks(); refresh.mockReset(); });

  it("rejects the full bidi-control set in filename and both localized alts", () => {
    const controls = ["\u061c", "\u200e", "\u200f", "\u202a", "\u202b", "\u202c", "\u202d", "\u202e", "\u2066", "\u2067", "\u2068", "\u2069"];
    for (const control of controls) for (const name of ["filename", "altEn", "altZh"] as const) {
      expect(
        () => validateImageUploadFields({...fields, [name]: `safe${control}text`}),
        `${name} accepted U+${control.codePointAt(0)!.toString(16).toUpperCase()}`,
      ).toThrowError(/MEDIA_UPLOAD_FIELDS_INVALID/);
    }
  });

  it.each(["a.b", "-abc", "abc-", "Private-media", "ab", `a${"b".repeat(63)}`])(
    "rejects invalid R2 bucket name %s",
    (bucket) => expect(() => resolveR2Config({...environment, R2_BUCKET: bucket})).toThrow("R2_CONFIGURATION_INVALID"),
  );
  it.each(["a0z", `a${"b".repeat(61)}z`])("accepts valid R2 bucket boundary %s", (bucket) => {
    expect(resolveR2Config({...environment, R2_BUCKET: bucket}).bucket).toBe(bucket);
  });

  it("resets the native file input after a successful upload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", {status: 201}));
    const reset = vi.spyOn(HTMLFormElement.prototype, "reset");
    render(<MediaUploadForm labels={labels}/>);
    const input = document.getElementById("media-upload-file") as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "logo.png", {type: "image/png"});
    fireEvent.change(input, {target: {files: [file]}});
    expect(input.files).toHaveLength(1);
    fireEvent.change(document.getElementById("media-upload-alt-en")!, {target: {value: "Partner logo"}});
    fireEvent.change(document.getElementById("media-upload-alt-zh")!, {target: {value: "合作夥伴標誌"}});
    fireEvent.click(screen.getByRole("button", {name: labels.upload}));
    expect(await screen.findByRole("status")).toHaveTextContent(labels.success);
    expect(reset).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(input).toHaveValue("");
      expect(document.getElementById("media-upload-alt-en")).toHaveValue("");
      expect(document.getElementById("media-upload-alt-zh")).toHaveValue("");
    });
    fireEvent.click(screen.getByRole("button", {name: labels.upload}));
    expect(await screen.findByRole("alert")).toHaveTextContent(labels.invalid);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it("maps a storage.get rejection to a generic 404 without provider detail", async () => {
    const bytes = Buffer.from("verified image body");
    const row = {id: "22222222-2222-4222-8222-222222222222", url: "/api/media/22222222-2222-4222-8222-222222222222", altEn: "Partner logo", altZh: "合作夥伴標誌", storageKey: "media/2026/08/id.png", storageEtag: '"etag"', originalFilename: "private.png", contentType: "image/png", byteSize: bytes.length, width: 10, height: 10, focalX: 50, focalY: 50, checksumSha256: createHash("sha256").update(bytes).digest("hex"), archivedAt: null};
    const get = vi.fn(async () => { throw new Error("provider-account-and-key-detail"); });
    const handler = createMediaGet({load: vi.fn(async () => row as never), storage: {get} as never});
    const response = await handler(new Request(`https://www.hkwtia.org${row.url}`), {params: Promise.resolve({id: row.id})});
    expect(get).toHaveBeenCalledWith({key: row.storageKey, etag: row.storageEtag});
    expect(response.status).toBe(404);
    const text = await response.text();
    expect(text).toBe("Not found");
    expect(text).not.toContain("provider-account-and-key-detail");
  });
});
