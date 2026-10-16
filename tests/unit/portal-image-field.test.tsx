import {cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";

import {PortalImageField, type PortalImageFieldLabels} from "@/components/portal/forms/image-field";
import {HeroUpload} from "@/components/portal/hero-upload";

const ID = "3f2b8c1e-5a47-4d0e-9b6a-1c2d3e4f5a6b";
const labels: PortalImageFieldLabels = {
  label: "Logo", empty: "No logo yet", previewAlt: "Current logo", external: "Linked image", remove: "Remove",
  upload: {choose: "Choose image", alt: "Image description", upload: "Upload", uploading: "Uploading", done: "Uploaded", failed: "Upload failed"},
};

function hidden(container: HTMLElement, name: string) {
  return container.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`);
}

async function upload(response: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  const file = new File(["x"], "logo.png", {type: "image/png"});
  fireEvent.change(document.querySelector('input[type="file"]')!, {target: {files: [file]}});
  const alt = screen.getByLabelText("Image description");
  fireEvent.change(alt, {target: {value: "A logo"}});
  fireEvent.click(screen.getByRole("button", {name: "Upload"}));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("PortalImageField", () => {
  it("previews a stored media id and keeps it in the hidden input", () => {
    const {container} = render(<PortalImageField name="logoMediaId" initialValue={ID} store="id" readOnly={false} labels={labels} />);
    const img = screen.getByAltText("Current logo");
    expect(img.getAttribute("src")).toBe(`/api/media/${ID}`);
    expect(hidden(container, "logoMediaId")!.value).toBe(ID);
  });

  it("shows the empty state and submits an empty value when there is no logo", () => {
    const {container} = render(<PortalImageField name="logoMediaId" initialValue="" store="id" readOnly={false} labels={labels} />);
    expect(screen.getByText("No logo yet")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
    expect(hidden(container, "logoMediaId")!.value).toBe("");
  });

  it("shows an external https reference as text, never as an image", () => {
    const {container} = render(<PortalImageField name="logoReference" initialValue="https://cdn.example.com/a.png" store="path" readOnly={false} labels={labels} />);
    expect(screen.getByText("Linked image")).toBeTruthy();
    expect(screen.getByText("https://cdn.example.com/a.png")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
    expect(hidden(container, "logoReference")!.value).toBe("https://cdn.example.com/a.png");
  });

  it("labels a stored site path as the current logo, not a linked image, and never renders it as an img", () => {
    const {container} = render(<PortalImageField name="logoReference" initialValue="/images/showcase/logo.svg" store="path" readOnly={false} labels={labels} />);
    expect(screen.getByText("Current logo")).toBeTruthy();
    expect(screen.queryByText("Linked image")).toBeNull();
    expect(screen.getByText("/images/showcase/logo.svg")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("links optional help text to the field group", () => {
    render(<PortalImageField name="logoReference" initialValue="" store="path" readOnly={false} labels={{...labels, help: "WTIA chooses the logo shown."}} />);
    expect(screen.getByRole("group", {name: "Logo"})).toHaveAccessibleDescription("WTIA chooses the logo shown.");
  });

  it("Enter in the description field starts the upload instead of submitting the parent form", async () => {
    const onSubmit = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({ok: true, json: async () => ({id: ID})});
    vi.stubGlobal("fetch", fetchMock);
    const {container} = render(
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <PortalImageField name="logoMediaId" initialValue="" store="id" readOnly={false} labels={labels} />
        <button type="submit">Save</button>
      </form>,
    );
    fireEvent.change(container.querySelector('input[type="file"]')!, {target: {files: [new File(["x"], "logo.png", {type: "image/png"})]}});
    const alt = screen.getByLabelText("Image description");
    fireEvent.change(alt, {target: {value: "A logo"}});
    // fireEvent returns false when the handler called preventDefault: the browser's implicit submit is cancelled.
    expect(fireEvent.keyDown(alt, {key: "Enter"})).toBe(false);
    await waitFor(() => expect(hidden(container, "logoMediaId")!.value).toBe(ID));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("Enter in the description field with no file chosen neither submits nor uploads", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<PortalImageField name="logoMediaId" initialValue="" store="id" readOnly={false} labels={labels} />);
    const alt = screen.getByLabelText("Image description");
    fireEvent.change(alt, {target: {value: "A logo"}});
    expect(fireEvent.keyDown(alt, {key: "Enter"})).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("previews a stored /api/media path", () => {
    render(<PortalImageField name="logoReference" initialValue={`/api/media/${ID}`} store="path" readOnly={false} labels={labels} />);
    expect(screen.getByAltText("Current logo").getAttribute("src")).toBe(`/api/media/${ID}`);
  });

  it("Remove empties the hidden input and shows the empty state", () => {
    const {container} = render(<PortalImageField name="logoMediaId" initialValue={ID} store="id" readOnly={false} labels={labels} />);
    fireEvent.click(screen.getByRole("button", {name: "Remove"}));
    expect(hidden(container, "logoMediaId")!.value).toBe("");
    expect(screen.getByText("No logo yet")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("stores /api/media/{id} after an upload when store is path", async () => {
    const {container} = render(<PortalImageField name="logoReference" initialValue="" store="path" readOnly={false} labels={labels} />);
    await upload({ok: true, json: async () => ({id: ID})});
    await waitFor(() => expect(hidden(container, "logoReference")!.value).toBe(`/api/media/${ID}`));
  });

  it("stores the bare id after an upload when store is id", async () => {
    const {container} = render(<PortalImageField name="logoMediaId" initialValue="" store="id" readOnly={false} labels={labels} />);
    await upload({ok: true, json: async () => ({id: ID})});
    await waitFor(() => expect(hidden(container, "logoMediaId")!.value).toBe(ID));
  });

  it("keeps the previous value when the upload fails", async () => {
    const {container} = render(<PortalImageField name="logoMediaId" initialValue={ID} store="id" readOnly={false} labels={labels} />);
    await upload({ok: false});
    await waitFor(() => expect(screen.getByText("Upload failed")).toBeTruthy());
    expect(hidden(container, "logoMediaId")!.value).toBe(ID);
  });

  it("offers no Remove button and no file input when read only", () => {
    const {container} = render(<PortalImageField name="logoMediaId" initialValue={ID} store="id" readOnly labels={labels} />);
    expect(screen.queryByRole("button", {name: "Remove"})).toBeNull();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(hidden(container, "logoMediaId")!.value).toBe(ID);
  });

  it("renders no upload zone in read-only mode, and the preview is not inside one", () => {
    const {container} = render(<PortalImageField name="logoMediaId" initialValue={ID} store="id" readOnly labels={labels} />);
    expect(container.querySelector(".portal-image-upload")).toBeNull();
    expect(screen.getByAltText("Current logo").closest(".portal-image-upload")).toBeNull();
  });
});

describe("HeroUpload without enterUploads", () => {
  it("leaves Enter alone, so the event form's existing behaviour is unchanged", () => {
    render(<HeroUpload labels={labels.upload} onUploaded={() => undefined} />);
    expect(fireEvent.keyDown(screen.getByLabelText("Image description"), {key: "Enter"})).toBe(true);
  });
});
