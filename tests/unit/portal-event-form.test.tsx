import {fireEvent, render, screen} from "@testing-library/react";
import type {ComponentProps} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

// eslint-disable-next-line @next/next/no-img-element -- a plain img stands in for next/image in jsdom
vi.mock("next/image", () => ({default: ({src, alt}: ComponentProps<"img">) => <img alt={alt} src={src} />}));

import {submitBlockedReason} from "@/app/[locale]/(member)/portal/events/labels";
import {EventForm, type EventFormLabels} from "@/components/portal/event-form";
import type {MemberEventView} from "@/lib/events/member-contract";

const labels: EventFormLabels = {
  pageAddress: "Page address", pageAddressHelp: "Your event will be at {path}",
  titleEn: "Title (English)", titleZh: "Title (Chinese)", descriptionEn: "Description (English)", descriptionZh: "Description (Chinese)",
  startsAt: "Starts", endsAt: "Ends", venue: "Venue", capacity: "Capacity", format: "Format",
  formats: {in_person: "In person", online: "Online", hybrid: "Hybrid"}, onlineUrl: "Online link",
  visibility: "Who can see it", visibilities: {public: "Public", members_only: "Members only"},
  registrationMode: "Registration method", registrationModes: {rsvp: "RSVP", external: "External"}, externalRegistrationUrl: "External registration link",
  tags: "Tags", tagsHelp: "Separate with commas",
  groups: {basics: "Basics", description: "Description", whenWhere: "When and where", registration: "Registration", imageTags: "Image and tags"},
  image: {
    label: "Hero image", empty: "No image yet", previewAlt: "Current hero image", external: "Linked image", remove: "Remove",
    upload: {choose: "Choose an image", alt: "Describe the image", upload: "Upload", uploading: "Uploading", done: "Uploaded", failed: "Failed"},
  },
  saveDraft: "Save draft", submit: "Submit for review", submitUnavailable: "No reviewed events left this quarter.", submitNotIncluded: "Your plan does not include publishing events.", saving: "Saving",
  errors: {INVALID: "Check the fields"},
};

const action = vi.fn(async () => ({status: "idle" as const}));

const stored: MemberEventView = {
  id: "11111111-1111-4111-8111-111111111111", slug: "stored-address", titleEn: "Stored title", titleZh: "", descriptionEn: "About", descriptionZh: "",
  startsAtLocal: "2099-01-01T10:00", endsAtLocal: "", venue: "", capacity: "", status: "draft", visibility: "public",
  format: "hybrid", onlineUrl: "https://x.test", registrationMode: "external", externalRegistrationUrl: "https://r.test",
  tags: "ai", heroMediaId: "22222222-2222-4222-8222-222222222222", rejectionReason: null, submittedAt: null, publishedAt: null,
};

const control = (container: HTMLElement, name: string) => container.querySelector<HTMLInputElement>(`[name=${name}]`)!;

describe("member event form: page address", () => {
  it("follows the English title on a new event until the member edits the address", () => {
    const {container} = render(<EventForm action={action} canSubmit labels={labels} values={null} />);
    fireEvent.change(screen.getByLabelText("Title (English)"), {target: {value: "AI in Logistics: Roundtable 2026"}});
    expect(control(container, "slug")).toHaveValue("ai-in-logistics-roundtable-2026");
    expect(container.textContent).toContain("Your event will be at /events/ai-in-logistics-roundtable-2026");

    fireEvent.change(control(container, "slug"), {target: {value: "logistics-roundtable"}});
    fireEvent.change(screen.getByLabelText("Title (English)"), {target: {value: "Something else"}});
    expect(control(container, "slug")).toHaveValue("logistics-roundtable");
    expect(container.textContent).toContain("/events/logistics-roundtable");
  });

  it("leaves the address empty for a title with no ASCII letters", () => {
    const {container} = render(<EventForm action={action} canSubmit labels={labels} values={null} />);
    fireEvent.change(screen.getByLabelText("Title (English)"), {target: {value: "人工智能論壇"}});
    expect(control(container, "slug")).toHaveValue("");
  });

  it("never changes the stored address when an existing event's title is edited", () => {
    const {container} = render(<EventForm action={action} canSubmit labels={labels} values={stored} />);
    fireEvent.change(screen.getByLabelText("Title (English)"), {target: {value: "A brand new title"}});
    expect(control(container, "slug")).toHaveValue("stored-address");
    expect(container.textContent).toContain("/events/stored-address");
  });

  it("keeps the slug pattern and labels the field Page address", () => {
    const {container} = render(<EventForm action={action} canSubmit labels={labels} values={null} />);
    expect(control(container, "slug")).toHaveAttribute("pattern", "[a-z0-9]+(?:-[a-z0-9]+)*");
    expect(screen.getByLabelText("Page address")).toBe(control(container, "slug"));
  });
});

describe("member event form: conditional fields", () => {
  it("hides and disables the online link unless the format is online or hybrid", () => {
    const {container} = render(<EventForm action={action} canSubmit labels={labels} values={null} />);
    const online = control(container, "onlineUrl");
    expect(online).toBeDisabled();
    expect(online).not.toBeVisible();
    fireEvent.change(screen.getByLabelText("Format"), {target: {value: "online"}});
    expect(online).toBeEnabled();
    expect(online).toBeVisible();
    fireEvent.change(screen.getByLabelText("Format"), {target: {value: "in_person"}});
    expect(online).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Format"), {target: {value: "hybrid"}});
    expect(online).toBeEnabled();
  });

  it("hides and disables the external registration link unless registration is external", () => {
    const {container} = render(<EventForm action={action} canSubmit labels={labels} values={null} />);
    const external = control(container, "externalRegistrationUrl");
    expect(external).toBeDisabled();
    expect(external).not.toBeVisible();
    fireEvent.change(screen.getByLabelText("Registration method"), {target: {value: "external"}});
    expect(external).toBeEnabled();
    expect(external).toBeVisible();
    fireEvent.change(screen.getByLabelText("Registration method"), {target: {value: "rsvp"}});
    expect(external).toBeDisabled();
  });

  // Review Focus 2: a stored hybrid / external event shows both links, filled in, on first render.
  it("shows a stored event's online and registration links on first render", () => {
    const {container} = render(<EventForm action={action} canSubmit labels={labels} values={stored} />);
    expect(control(container, "onlineUrl")).toBeVisible();
    expect(control(container, "onlineUrl")).toBeEnabled();
    expect(control(container, "onlineUrl")).toHaveValue("https://x.test");
    expect(control(container, "externalRegistrationUrl")).toBeVisible();
    expect(control(container, "externalRegistrationUrl")).toBeEnabled();
    expect(control(container, "externalRegistrationUrl")).toHaveValue("https://r.test");
  });

  // With JavaScript off the server HTML is all the member gets, so nothing may start hidden or disabled.
  it("renders every conditional field visible and enabled in the server HTML", () => {
    const html = renderToStaticMarkup(<EventForm action={action} canSubmit labels={labels} values={null} />);
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const name of ["onlineUrl", "externalRegistrationUrl"]) {
      const input = doc.querySelector<HTMLInputElement>(`input[name=${name}]`);
      expect(input).not.toBeNull();
      expect(input!.disabled).toBe(false);
      expect(input!.closest("[hidden]")).toBeNull();
    }
  });
});

describe("member event form: actions", () => {
  it("offers Save draft as secondary and Submit for review as the one primary", () => {
    const {container} = render(<EventForm action={action} canSubmit labels={labels} values={null} />);
    expect(container.querySelectorAll(".button")).toHaveLength(1);
    expect(screen.getByRole("button", {name: "Submit for review"})).toHaveClass("button");
    expect(screen.getByRole("button", {name: "Save draft"})).toHaveClass("portal-button-outline");
    expect(screen.queryByText(labels.submitUnavailable)).toBeNull();
  });

  it("drops Submit for review and says the quota is used up", () => {
    const {container} = render(<EventForm action={action} canSubmit={false} labels={labels} submitBlockedBy="quota" values={null} />);
    expect(screen.queryByRole("button", {name: "Submit for review"})).toBeNull();
    expect(screen.getByText(labels.submitUnavailable)).toBeInTheDocument();
    expect(container.querySelectorAll(".button")).toHaveLength(1);
    expect(screen.getByRole("button", {name: "Save draft"})).toHaveAccessibleDescription(labels.submitUnavailable);
  });

  it("says the plan has no event publishing when that is why", () => {
    const {container} = render(<EventForm action={action} canSubmit={false} labels={labels} submitBlockedBy="plan" values={null} />);
    expect(screen.queryByRole("button", {name: "Submit for review"})).toBeNull();
    expect(screen.getByText(labels.submitNotIncluded)).toBeInTheDocument();
    expect(screen.queryByText(labels.submitUnavailable)).toBeNull();
    expect(container.querySelectorAll(".button")).toHaveLength(1);
    expect(screen.getByRole("button", {name: "Save draft"})).toHaveAccessibleDescription(labels.submitNotIncluded);
  });

  it("shows no reason line when the page already explains it", () => {
    const {container} = render(<EventForm action={action} canSubmit={false} labels={labels} values={null} />);
    expect(screen.queryByText(labels.submitUnavailable)).toBeNull();
    expect(screen.queryByText(labels.submitNotIncluded)).toBeNull();
    expect(container.querySelector("#event-submit-note")).toBeNull();
    expect(screen.getByRole("button", {name: "Save draft"})).not.toHaveAttribute("aria-describedby");
    expect(container.querySelectorAll(".button")).toHaveLength(1);
  });

  it("keeps exactly one primary when nothing can be saved either", () => {
    const {container} = render(<EventForm action={action} canSaveDraft={false} canSubmit={false} labels={labels} values={stored} />);
    expect(container.querySelectorAll(".button")).toHaveLength(1);
    expect(screen.getByRole("button", {name: "Save draft"})).toBeDisabled();
  });
});

describe("member event form: hero image and contract", () => {
  it("submits the hero image through a hidden input, never a visible text box", () => {
    const {container} = render(<EventForm action={action} canSubmit labels={labels} values={stored} />);
    const hero = container.querySelectorAll<HTMLInputElement>("input[name=heroMediaId]");
    expect(hero).toHaveLength(1);
    expect(hero[0]).toHaveAttribute("type", "hidden");
    expect(hero[0]).toHaveValue(stored.heroMediaId);
    expect(screen.getByText("Choose an image")).toBeInTheDocument();
  });

  it("keeps the stored hero but hides the upload when uploads are not allowed", () => {
    const {container} = render(<EventForm action={action} canSubmit={false} canUploadHero={false} labels={labels} values={stored} />);
    expect(control(container, "heroMediaId")).toHaveValue(stored.heroMediaId);
    expect(screen.queryByText("Choose an image")).toBeNull();
  });

  it("submits exactly the names the member-event parser reads, plus intent", () => {
    const {container} = render(<EventForm action={action} canSubmit labels={labels} values={null} />);
    fireEvent.change(screen.getByLabelText("Format"), {target: {value: "hybrid"}});
    fireEvent.change(screen.getByLabelText("Registration method"), {target: {value: "external"}});
    const names = [...container.querySelectorAll<HTMLInputElement>("form [name]")].filter((element) => !element.disabled).map((element) => element.name);
    expect(new Set(names)).toEqual(new Set([
      "slug", "titleEn", "titleZh", "descriptionEn", "descriptionZh", "startsAt", "endsAt", "venue", "capacity", "format",
      "onlineUrl", "visibility", "registrationMode", "externalRegistrationUrl", "tags", "heroMediaId", "intent",
    ]));
    expect(names).toHaveLength(new Set(names).size);
  });

  it("adds eventId on edit", () => {
    const {container} = render(<EventForm action={action} canSubmit labels={labels} values={stored} />);
    expect(control(container, "eventId")).toHaveValue(stored.id);
  });

  it("puts the fields in five titled groups", () => {
    render(<EventForm action={action} canSubmit labels={labels} values={null} />);
    for (const name of Object.values(labels.groups)) expect(screen.getByRole("group", {name})).toBeInTheDocument();
  });
});

describe("submitBlockedReason", () => {
  it("names the quota when the plan has reviewed events but they are used up", () => {
    expect(submitBlockedReason({canPublish: false, limit: 2})).toBe("quota");
  });
  it("names the plan when it includes no event publishing", () => {
    expect(submitBlockedReason({canPublish: false, limit: 0})).toBe("plan");
  });
  it("gives no reason when submitting is allowed or there is no publishing context", () => {
    expect(submitBlockedReason({canPublish: true, limit: 2})).toBeNull();
    expect(submitBlockedReason(null)).toBeNull();
  });
});
