import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PageCopyForm } from "@/components/admin/page-copy-form";
import { AdminUnsavedChangesProvider } from "@/components/admin/unsaved-changes-guard";
import {
  pageCopyCatalog,
  pageCopyBundleValues,
} from "@/lib/i18n/page-copy-catalog";
import { pageCopyFieldName } from "@/lib/admin/page-copy-form-input";
it("opens one Home block instead of all bilingual textareas at once", () => {
  const zh = pageCopyBundleValues("zh-HK", "Home");
  const fields = pageCopyCatalog("Home").map(({ keyPath, value }) => ({
    keyPath,
    enBundle: value,
    zhBundle: zh.get(keyPath) ?? value,
    enField: pageCopyFieldName("en", keyPath),
    zhField: pageCopyFieldName("zh-HK", keyPath),
    enValue: "",
    zhValue: "",
  }));
  expect(fields.length).toBeGreaterThan(100);
  const view = render(
    <AdminUnsavedChangesProvider confirmMessage="Leave?">
      <PageCopyForm
        action={vi.fn(async () => ({}))}
        fields={fields}
        revision={"a".repeat(64)}
        labels={{
          english: "English",
          chinese: "Chinese",
          revertHint: "Fallback",
          save: "Publish",
          saving: "Publishing",
          previewDraft: "Preview",
          previewPrivate: "Private",
          previewEnglish: "English preview",
          previewChinese: "Chinese preview",
        }}
      />
    </AdminUnsavedChangesProvider>,
  );
  expect(view.container.querySelectorAll("textarea").length).toBeLessThan(80);
});

it("retains all bilingual field values while switching blocks, searching and resetting one visible field", () => {
  const zh = pageCopyBundleValues("zh-HK", "Home");
  const fields = pageCopyCatalog("Home").map(({ keyPath, value }) => ({
    keyPath,
    enBundle: value,
    zhBundle: zh.get(keyPath) ?? value,
    enField: pageCopyFieldName("en", keyPath),
    zhField: pageCopyFieldName("zh-HK", keyPath),
    enValue: "",
    zhValue: "",
  }));
  const labels = {
    english: "English",
    chinese: "Chinese",
    revertHint: "Fallback",
    save: "Publish",
    saving: "Publishing",
    previewDraft: "Preview",
    previewPrivate: "Private",
    previewEnglish: "English preview",
    previewChinese: "Chinese preview",
    workspace: {
      block: "Block",
      search: "Search block",
      changedOnly: "Changed only",
      previous: "Previous",
      next: "Next",
      reset: "Reset copy",
      empty: "No matches",
    },
  };
  const view = render(
    <AdminUnsavedChangesProvider confirmMessage="Leave?">
      <PageCopyForm
        action={vi.fn(async () => ({}))}
        fields={fields}
        revision={"a".repeat(64)}
        labels={labels}
      />
    </AdminUnsavedChangesProvider>,
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Block" }), {
    target: { value: "hero" },
  });
  fireEvent.input(screen.getByLabelText("English · hero.title"), {
    target: { value: "Retained synthetic draft" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Block" }), {
    target: { value: "pathways" },
  });
  let data = new FormData(view.container.querySelector("form")!);
  expect(data.get("copy:en:hero.title")).toBe("Retained synthetic draft");
  expect(
    [...data.keys()].filter((name) => name.startsWith("copy:")),
  ).toHaveLength(fields.length * 2);
  fireEvent.change(screen.getByRole("combobox", { name: "Block" }), {
    target: { value: "hero" },
  });
  expect(screen.getByLabelText("English · hero.title")).toHaveValue(
    "Retained synthetic draft",
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Changed only" }));
  expect(view.container.querySelectorAll("textarea")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Reset copy" }));
  data = new FormData(view.container.querySelector("form")!);
  expect(data.get("copy:en:hero.title")).toBe("");
  expect(
    [...data.keys()].filter((name) => name.startsWith("copy:")),
  ).toHaveLength(fields.length * 2);
});

it("keeps the selected block after a successful action resets form controls", async () => {
  const fields = pageCopyCatalog("Home").map(({ keyPath, value }) => ({
    keyPath,
    enBundle: value,
    zhBundle: value,
    enField: pageCopyFieldName("en", keyPath),
    zhField: pageCopyFieldName("zh-HK", keyPath),
    enValue: "",
    zhValue: "",
  }));
  const labels = {
    english: "English",
    chinese: "Chinese",
    revertHint: "Fallback",
    save: "Publish",
    saving: "Publishing",
    previewDraft: "Preview",
    previewPrivate: "Private",
    previewEnglish: "English preview",
    previewChinese: "Chinese preview",
    workspace: {
      block: "Block",
      search: "Search block",
      changedOnly: "Changed only",
      previous: "Previous",
      next: "Next",
      reset: "Reset copy",
      empty: "No matches",
    },
  };
  render(
    <AdminUnsavedChangesProvider confirmMessage="Leave?">
      <PageCopyForm
        action={vi.fn(async () => ({
          status: "success" as const,
          message: "Saved",
          revision: "b".repeat(64),
        }))}
        fields={fields}
        revision={"a".repeat(64)}
        labels={labels}
      />
    </AdminUnsavedChangesProvider>,
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Block" }), {
    target: { value: "hero" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Saved"),
  );
  expect(screen.getByRole("combobox", { name: "Block" })).toHaveValue("hero");
  expect(screen.getByLabelText("English · hero.title")).toBeInTheDocument();
});
