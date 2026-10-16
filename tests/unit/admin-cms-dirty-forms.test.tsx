import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {AdminUnsavedChangesProvider} from "@/components/admin/unsaved-changes-guard";
import {NewsForm} from "@/components/admin/news-form";
import {PageCopyForm} from "@/components/admin/page-copy-form";
import {EventForm} from "@/components/admin/event-form";
import type {NewsActionState} from "@/lib/admin/news-action-core";

const action = vi.fn(async () => ({}));
const newsLabels = {slug: "Slug", titleEn: "English title", titleZh: "Chinese title", author: "Author", bodyMdx: "English body", bodyMdxZhHk: "Chinese body", bodyHelp: "Help", published: "Published", save: "Save", saving: "Saving", saveDraft: "Save as draft", savePublish: "Save and publish", previewDraft: "Preview draft", previewPrivate: "Draft preview", previewEnglish: "English", previewChinese: "Chinese"};
const pageLabels = {english: "English copy", chinese: "Chinese copy", revertHint: "Fallback", save: "Save", saving: "Saving", saveDraft: "Save as draft", savePublish: "Save and publish", previewDraft: "Preview draft", previewPrivate: "Draft preview", previewEnglish: "English", previewChinese: "Chinese"};
const eventLabels = {
  slug: "Slug", titleEn: "English title", titleZh: "Chinese title", descriptionEn: "English description", descriptionZh: "Chinese description",
  startsAt: "Starts", endsAt: "Ends", venue: "Venue", capacity: "Capacity", registrationMode: "Registration",
  registrationModes: {rsvp: "RSVP", external: "External", ticketed: "Ticketed"}, ticketPriceHkdCents: "Ticket price",
  memberOnly: "Members only", published: "Published", heroMediaId: "Hero", noHeroMedia: "No hero", save: "Save", saving: "Saving", saveDraft: "Save as draft", savePublish: "Save and publish", previewDraft: "Preview draft", previewPrivate: "Private draft preview", previewEnglish: "English", previewChinese: "Chinese",
  format: "Format", formats: {in_person: "In person", online: "Online", hybrid: "Hybrid"}, onlineUrl: "Online URL",
  externalRegistrationUrl: "External registration URL", tags: "Tags", visibility: "Visibility",
  visibilities: {public: "Public", members_only: "Members only", invite_only: "Invite only"},
};
function expectReloadWarning() {
  const unload = new Event("beforeunload", {cancelable: true});
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
}

describe("admin CMS draft changes", () => {
  it("marks edited news as unsaved", () => {
    render(<AdminUnsavedChangesProvider confirmMessage="Leave?"><NewsForm action={action} labels={newsLabels}/></AdminUnsavedChangesProvider>);
    fireEvent.input(screen.getByLabelText("English title"), {target: {value: "Unpublished edit"}});
    expectReloadWarning();
  });
  it("retains edits after a failed save and clears the warning only after a successful save", async () => {
    let result: NewsActionState = {status: "error", message: "Try again", values: {titleEn: "Draft"}};
    const save = vi.fn(async () => result);
    render(<AdminUnsavedChangesProvider confirmMessage="Leave?"><NewsForm action={save} labels={newsLabels}/></AdminUnsavedChangesProvider>);
    fireEvent.input(screen.getByLabelText("English title"), {target: {value: "Draft"}});
    const submit = screen.getByRole("button", {name: "Save as draft"});
    fireEvent.click(submit);
    await waitFor(() => expect(screen.getByRole("alert", {name: ""})).toHaveTextContent("Try again"));
    expect(screen.getByLabelText("English title")).toHaveValue("Draft");
    expectReloadWarning();
    result = {status: "success", message: "Saved"};
    fireEvent.click(screen.getByRole("button", {name: "Save as draft"}));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved"));
    const unload = new Event("beforeunload", {cancelable: true});
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
  });  it("marks edited bilingual page copy as unsaved", () => {
    render(<AdminUnsavedChangesProvider confirmMessage="Leave?"><PageCopyForm action={action} fields={[{keyPath: "home.title", enBundle: "Default", zhBundle: "預設", enField: "en.home.title", zhField: "zh.home.title", enValue: "Current", zhValue: "目前"}]} labels={pageLabels} revision={"0".repeat(64)}/></AdminUnsavedChangesProvider>);
    fireEvent.input(screen.getByLabelText("Chinese copy"), {target: {value: "未儲存"}});
    expectReloadWarning();
  });
  it("previews effective bilingual page copy inside the admin form", () => {
    const {container} = render(<AdminUnsavedChangesProvider confirmMessage="Leave?"><PageCopyForm action={action} fields={[{keyPath: "home.title", enBundle: "Default", zhBundle: "預設", enField: "en.home.title", zhField: "zh.home.title", enValue: "Current", zhValue: "目前"}]} labels={pageLabels} revision={"0".repeat(64)}/></AdminUnsavedChangesProvider>);
    fireEvent.change(screen.getByLabelText("Chinese copy"), {target: {value: "<script>alert(1)</script>"}});
    fireEvent.click(screen.getByRole("button", {name: "Preview draft"}));
    expect(screen.getByText("Draft preview")).toBeInTheDocument();
    expect(screen.getAllByText("Current")).toHaveLength(2);
    expect(within(screen.getByRole("region", {name: "Draft preview"})).getByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
  });

  it("marks changed event settings as unsaved", () => {
    render(<AdminUnsavedChangesProvider confirmMessage="Leave?"><EventForm action={action} labels={eventLabels}/></AdminUnsavedChangesProvider>);
    fireEvent.change(screen.getByLabelText("Registration"), {target: {value: "external"}});
    expectReloadWarning();
  });
});