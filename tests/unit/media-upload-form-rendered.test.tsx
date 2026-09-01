import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {MediaUploadForm} from "@/components/admin/media-upload-form";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({useRouter: () => ({refresh})}));

const labels = {
  title: "Upload a private image",
  description: "Normalized and private.",
  file: "Image file",
  fileHelp: "PNG, JPEG or WebP, up to 4 MiB.",
  altEn: "Alt text (English)",
  altZh: "Alt text (Chinese)",
  altHelp: "Describe the image.",
  focalX: "Horizontal focal point (%)",
  focalY: "Vertical focal point (%)",
  upload: "Upload image",
  uploading: "Uploading…",
  success: "Image uploaded and registered.",
  invalid: "Check the file and image details.",
  error: "The image could not be uploaded.",
};

describe("rendered private media upload form", () => {
  beforeEach(() => { vi.restoreAllMocks(); refresh.mockReset(); });

  it("keeps every field controlled and posts raw bytes to the dedicated route", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", {status: 201}));
    render(<MediaUploadForm labels={labels}/>);
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "partner logo.png", {type: "image/png"});
    fireEvent.change(document.getElementById("media-upload-file") as HTMLInputElement, {target: {files: [file]}});
    fireEvent.change(document.getElementById("media-upload-alt-en") as HTMLInputElement, {target: {value: "Partner logo"}});
    fireEvent.change(document.getElementById("media-upload-alt-zh") as HTMLInputElement, {target: {value: "合作夥伴標誌"}});
    fireEvent.change(document.getElementById("media-upload-focal-x") as HTMLInputElement, {target: {value: "40"}});
    fireEvent.change(document.getElementById("media-upload-focal-y") as HTMLInputElement, {target: {value: "60"}});
    fireEvent.click(screen.getByRole("button", {name: labels.upload}));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [url, options] = fetch.mock.calls[0]!;
    expect(String(url)).toContain("/api/admin/media/upload?");
    expect(String(url)).toContain("filename=partner+logo.png");
    expect(String(url)).toContain("altEn=Partner+logo");
    expect(String(url)).toContain("focalX=40");
    expect(options).toMatchObject({method: "POST", credentials: "same-origin", body: file});
    expect((options?.headers as Record<string, string>)["Content-Type"]).toBe("image/png");
    expect(await screen.findByRole("status")).toHaveTextContent(labels.success);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("rejects an over-limit file locally without losing the other fields", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", {status: 201}));
    render(<MediaUploadForm labels={labels}/>);
    fireEvent.change(document.getElementById("media-upload-alt-en") as HTMLInputElement, {target: {value: "Keep this text"}});
    const file = new File([new Uint8Array(4_194_305)], "too-large.png", {type: "image/png"});
    fireEvent.change(document.getElementById("media-upload-file") as HTMLInputElement, {target: {files: [file]}});
    fireEvent.click(screen.getByRole("button", {name: labels.upload}));

    expect(await screen.findByRole("alert")).toHaveTextContent(labels.invalid);
    expect(document.getElementById("media-upload-alt-en") as HTMLInputElement).toHaveValue("Keep this text");
    expect(fetch).not.toHaveBeenCalled();
  });
});
