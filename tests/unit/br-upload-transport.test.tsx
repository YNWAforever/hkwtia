import {renderToStaticMarkup} from "react-dom/server";
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import nextConfig from "@/next.config";
import {JoinForm} from "@/components/join/join-form";
import {submitWithBrParts} from "@/lib/membership/br-submission";
import {BR_UPLOAD_LIMITS} from "@/config/membership-journey";

describe("BR upload transport", () => {
  it("admits a 3 MB multipart request with headroom while staying below Vercel's 4.5 MB ceiling", async () => {
    const limit = nextConfig.experimental?.serverActions?.bodySizeLimit ?? 1024 * 1024;
    const bytes = typeof limit === "number" ? limit : Number.parseFloat(limit) * 1024 * 1024;
    expect(bytes).toBeGreaterThan(3 * 1024 * 1024 + 20 * 1024);
    expect(bytes).toBeLessThan(4.5 * 1024 * 1024);
  });

  it("retains native server-action metadata before the organisation form hydrates", () => {
    const action = Object.assign(async () => ({}), {$$FORM_ACTION: () => ({name: "native-action", method: "POST", encType: "multipart/form-data", action: "/native-submit", data: new FormData()})});
    Object.defineProperty(action, "bind", {value: () => action});
    const html = renderToStaticMarkup(<JoinForm action={action} fieldNames={[]} pendingLabel="Saving" submitLabel="Submit" splitBusinessRegistration>{null}</JoinForm>);
    expect(html).toContain('action="/native-submit"');
  });

  it("returns a localized size error without sending an oversized file", async () => {
    const form = new FormData();
    form.set("businessRegistration", new File([new Uint8Array(BR_UPLOAD_LIMITS.maxBytes + 1)], "br.pdf"));
    const action = vi.fn(async (_state, data: FormData) => {
      expect(data.has("businessRegistration")).toBe(false);
      expect(data.get("brTooLarge")).toBe("1");
      return {fieldErrors: {businessRegistration: "localized:errors.brSize"}};
    });
    await expect(submitWithBrParts(action, {}, form)).resolves.toEqual({fieldErrors: {businessRegistration: "localized:errors.brSize"}});
  });

  it("stops before final submission when a part is rejected", async () => {
    const form = new FormData();
    form.set("businessRegistration", new File([new Uint8Array(4 * 1024 * 1024)], "br.pdf"));
    const action = vi.fn(async () => ({fieldErrors: {businessRegistration: "localized:errors.brStorage"}}));
    await expect(submitWithBrParts(action, {}, form)).resolves.toEqual({fieldErrors: {businessRegistration: "localized:errors.brStorage"}});
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("submits an 8 MB organisation BR in bounded parts before the final contact submission", async () => {
    const requests: FormData[] = [];
    const action = vi.fn(async (_state, data: FormData) => {requests.push(data); return {};});
    render(<JoinForm action={action} fieldNames={["businessRegistration"]} pendingLabel="Saving" submitLabel="Submit" splitBusinessRegistration>
      <input name="businessRegistration" type="file"/>
      <input name="secondaryName" defaultValue="Contact B"/>
    </JoinForm>);
    const bytes = new Uint8Array(BR_UPLOAD_LIMITS.maxBytes);
    bytes.set([0x25, 0x50, 0x44, 0x46]);
    // jsdom does not encode synthetic FileLists, so supply the selected file at that DOM boundary.
    const selected = new File([bytes], "br.pdf", {type: "application/pdf"});
    const NativeFormData = globalThis.FormData;
    class SelectedFormData extends NativeFormData {
      constructor(form?: HTMLFormElement) {
        super(form);
        if (form) this.set("businessRegistration", selected);
      }
    }
    vi.stubGlobal("FormData", SelectedFormData);
    try {
      fireEvent.submit(screen.getByRole("button", {name: "Submit"}).closest("form")!);
      await waitFor(() => expect(requests.length).toBe(4));
      expect(requests.slice(0, 3).map(data => (data.get("businessRegistration") as File).size)).toEqual([3 * 1024 * 1024, 3 * 1024 * 1024, 2 * 1024 * 1024]);
      expect(requests[3].has("businessRegistration")).toBe(false);
      expect(requests[3].get("brPartCount")).toBe("3");
      expect(requests[3].get("secondaryName")).toBe("Contact B");
    } finally {vi.unstubAllGlobals();}
  });
});
