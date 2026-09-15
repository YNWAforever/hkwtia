import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

const writer = vi.hoisted(() => ({result: {status: "ok", copy: {descriptionEn: "Generated EN", descriptionZh: "Generated ZH"}}}));
vi.mock("@/lib/portal/writer-actions", () => ({writerAssistAction: vi.fn(async () => writer.result)}));

import {EventForm, type EventFormLabels} from "@/components/portal/event-form";
import type {WriterAssistProps} from "@/components/portal/writer-assist";

const labels = {
  slug: "Slug", titleEn: "Title (EN)", titleZh: "Title (ZH)", descriptionEn: "Description (EN)", descriptionZh: "Description (ZH)",
  startsAt: "Starts", endsAt: "Ends", venue: "Venue", capacity: "Capacity", format: "Format",
  formats: {in_person: "In person", online: "Online", hybrid: "Hybrid"},
  onlineUrl: "Online URL", visibility: "Visibility", visibilities: {public: "Public", members_only: "Members"},
  registrationMode: "Registration", registrationModes: {rsvp: "RSVP", external: "External"}, externalRegistrationUrl: "External URL",
  tags: "Tags", heroMediaId: "Hero", heroHelp: "Help", hero: {choose: "Choose", alt: "Alt", upload: "Upload", uploading: "Uploading", done: "Done", failed: "Failed"},
  saveDraft: "Save draft", submit: "Submit", saving: "Saving",
  errors: {},
} as unknown as EventFormLabels;

const writerProps: WriterAssistProps = {
  kind: "event", quotaLabel: "Unlimited generations", exhausted: false,
  labels: {label: "Write with AI", briefLabel: "What is this about?", briefPlaceholder: "Notes", generate: "Generate", generating: "Generating…", errors: {INVALID: "Invalid", FORBIDDEN: "Forbidden", NOT_ENTITLED: "Not entitled", QUOTA_EXCEEDED: "Quota", UNAVAILABLE: "Unavailable", FAILED: "Failed"}},
};

describe("EventForm writer integration", () => {
  it("fills both descriptions from one generation", async () => {
    render(<EventForm action={async () => ({status: "idle"})} canSubmit labels={labels} values={null} writer={writerProps} />);

    fireEvent.click(screen.getByText("Write with AI"));
    fireEvent.change(screen.getByLabelText("What is this about?"), {target: {value: "A workshop"}});
    fireEvent.click(screen.getByRole("button", {name: "Generate"}));

    expect(await screen.findByDisplayValue("Generated EN")).toBeVisible();
    expect(screen.getByDisplayValue("Generated ZH")).toBeVisible();
  });

  it("renders no control when the surface passes none", () => {
    render(<EventForm action={async () => ({status: "idle"})} canSubmit labels={labels} values={null} />);
    expect(screen.queryByText("Write with AI")).not.toBeInTheDocument();
  });
});
