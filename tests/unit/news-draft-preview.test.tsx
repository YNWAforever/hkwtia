import {fireEvent, render, screen, within} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {NewsForm} from "@/components/admin/news-form";

describe("private news draft preview", () => {
  it("names draft saving and publishing before the editor submits", () => {
    render(<NewsForm
      action={vi.fn()}
      labels={{
        slug: "Slug", titleEn: "English title", titleZh: "Chinese title",
        author: "Author", bodyMdx: "English body", bodyMdxZhHk: "Chinese body",
        bodyHelp: "Safe formatting only", published: "Publish when saved",
        save: "Save changes", saving: "Saving",
        saveDraft: "Save as draft", savePublish: "Save and publish",
        previewDraft: "Preview draft", previewPrivate: "Draft preview — private",
        previewEnglish: "English preview", previewChinese: "Chinese preview",
      }}
    />);
    expect(screen.getByRole("button", {name: "Save as draft"})).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", {name: "Publish when saved"}));
    expect(screen.getByRole("button", {name: "Save and publish"})).toBeInTheDocument();
  });  it("renders the current unsaved English and Chinese body through the safe renderer", () => {
    render(<NewsForm
      action={vi.fn()}
      labels={{
        slug: "Slug", titleEn: "English title", titleZh: "Chinese title",
        author: "Author", bodyMdx: "English body", bodyMdxZhHk: "Chinese body",
        bodyHelp: "Safe formatting only", published: "Published",
        save: "Save", saving: "Saving",
        saveDraft: "Save as draft", savePublish: "Save and publish",
        previewDraft: "Preview draft", previewPrivate: "Draft preview — private",
        previewEnglish: "English preview", previewChinese: "Chinese preview",
      }}
      values={{
        slug: "draft", titleEn: "Old English", titleZh: "舊標題",
        author: "WTIA", bodyMdx: "Old body", bodyMdxZhHk: "舊內文",
      }}
    />);
    fireEvent.change(screen.getByLabelText("English title"), {target: {value: "New English"}});
    fireEvent.change(screen.getByLabelText(/English body/), {target: {value: "## Draft heading\n\nNew **copy**"}});
    fireEvent.change(screen.getByLabelText(/Chinese body/), {target: {value: "## 中文預覽"}});
    fireEvent.click(screen.getByRole("button", {name: "Preview draft"}));
    expect(screen.getByText("Draft preview — private")).toBeInTheDocument();
    expect(screen.getByText("New English")).toBeInTheDocument();
    expect(screen.getByText("Draft heading")).toBeInTheDocument();
    expect(screen.getByText("中文預覽")).toBeInTheDocument();
    expect(within(screen.getByRole("region", {name: "Draft preview — private"})).queryByText("Old body")).not.toBeInTheDocument();
  });
});