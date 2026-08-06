import {describe, expect, it} from "vitest";
import {z} from "zod";

import {runPageCopyFormAction} from "@/lib/admin/page-copy-action-core";
import {pageCopyFieldName, pageCopyFormInput} from "@/lib/admin/page-copy-form-input";
import {pageCopyCatalog} from "@/lib/i18n/page-copy-catalog";

const messages = {
  successMessage: "Saved.",
  unchangedMessage: "No changes to save.",
  validationMessage: "Check the highlighted fields.",
  errorMessage: "Something went wrong.",
};

const heading = "sections.0.heading";

describe("page copy form action core", () => {
  it("reports a save and a no-op differently", async () => {
    await expect(runPageCopyFormAction({}, new FormData(), {
      ...messages, mutate: async () => ({updated: 2, cleared: 1}),
    })).resolves.toEqual({status: "success", message: "Saved."});

    await expect(runPageCopyFormAction({}, new FormData(), {
      ...messages, mutate: async () => ({updated: 0, cleared: 0}),
    })).resolves.toEqual({status: "success", message: "No changes to save."});
  });

  it("maps a rejected key path to a field error", async () => {
    await expect(runPageCopyFormAction({}, new FormData(), {
      ...messages,
      mutate: async () => {
        throw new z.ZodError([{
          code: z.ZodIssueCode.custom, path: [heading], message: "KEY_PATH_UNKNOWN",
        }]);
      },
    })).resolves.toEqual({
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: {[heading]: "Check the highlighted fields."},
    });
  });

  it("never leaks a domain error to the browser", async () => {
    const state = await runPageCopyFormAction({}, new FormData(), {
      ...messages,
      mutate: async () => {
        throw new Error("connection to private-host.internal refused");
      },
    });

    expect(state).toEqual({status: "error", message: "Something went wrong."});
    expect(JSON.stringify(state)).not.toContain("private-host.internal");
  });

  it.each(["UNAUTHORIZED", "FORBIDDEN"])("re-throws %s for the action boundary", async (message) => {
    await expect(runPageCopyFormAction({}, new FormData(), {
      ...messages,
      mutate: async () => {
        throw new Error(message);
      },
    })).rejects.toThrow(message);
  });
});

describe("page copy form input", () => {
  it("reads both locales for every catalog path", () => {
    const data = new FormData();
    data.set(pageCopyFieldName("en", heading), "What we collect");
    data.set(pageCopyFieldName("zh-HK", heading), "我們收集的資料");

    const input = pageCopyFormInput("Privacy", data);
    const catalog = pageCopyCatalog("Privacy");

    expect(input.namespace).toBe("Privacy");
    expect(input.entries).toHaveLength(catalog.length * 2);
    expect(input.entries).toContainEqual({locale: "en", keyPath: heading, value: "What we collect"});
    expect(input.entries).toContainEqual({locale: "zh-HK", keyPath: heading, value: "我們收集的資料"});
  });

  it("treats an absent field as a cleared override rather than skipping it", () => {
    const {entries} = pageCopyFormInput("Contact", new FormData());

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every(({value}) => value === "")).toBe(true);
  });

  it("ignores a field name that is not in the catalog", () => {
    const data = new FormData();
    data.set("copy:en:sections.0.body.99", "injected");
    data.set("copy:en:__proto__", "injected");
    data.set("slug", "injected");

    const {entries} = pageCopyFormInput("Privacy", data);

    expect(entries.map(({keyPath}) => keyPath)).not.toContain("sections.0.body.99");
    expect(entries.map(({keyPath}) => keyPath)).not.toContain("__proto__");
    expect(entries.every(({value}) => value !== "injected")).toBe(true);
  });

  it("namespaces field names by locale so the two columns cannot collide", () => {
    expect(pageCopyFieldName("en", heading)).toBe(`copy:en:${heading}`);
    expect(pageCopyFieldName("zh-HK", heading)).toBe(`copy:zh-HK:${heading}`);
  });
});
