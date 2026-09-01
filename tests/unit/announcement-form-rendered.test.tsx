import {render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

const reactState = vi.hoisted(() => ({
  results: [] as Array<readonly [unknown, (formData: FormData) => void, boolean]>,
  useActionState: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  reactState.useActionState.mockImplementation((action: (formData: FormData) => void, initial: unknown) =>
    reactState.results.shift() ?? [initial, action, false]);
  return {...actual, useActionState: reactState.useActionState};
});

import {
  AnnouncementForm,
  AnnouncementLifecycleControls,
  type AnnouncementFormLabels,
} from "@/components/admin/announcement-form";

function labels(locale: "en" | "zh-HK"): AnnouncementFormLabels {
  const value = locale === "en" ? en.Admin.announcements : zh.Admin.announcements;
  return {
    titleEn: value.titleEn,
    titleZhHk: value.titleZhHk,
    ctaLabelEn: value.ctaLabelEn,
    ctaLabelZhHk: value.ctaLabelZhHk,
    href: value.href,
    startsAt: value.startsAt,
    endsAt: value.endsAt,
    timeHelp: value.timeHelp,
    priority: value.priority,
    priorityHelp: value.priorityHelp,
    save: value.save,
    saving: value.saving,
  };
}

describe("rendered announcement forms", () => {
  beforeEach(() => {
    reactState.results = [];
    reactState.useActionState.mockClear();
  });

  it.each(["en", "zh-HK"] as const)("renders localized create and edit fields in %s", (locale) => {
    const copy = labels(locale);
    const action = vi.fn();
    const view = render(<AnnouncementForm action={action} labels={copy}/>);

    for (const label of [copy.titleEn, copy.titleZhHk, copy.ctaLabelEn, copy.ctaLabelZhHk, copy.href, copy.startsAt, copy.endsAt, copy.priority]) {
      expect(screen.getByLabelText(label, {exact: false})).toBeInTheDocument();
    }
    expect(screen.getByRole("button", {name: copy.save})).toBeEnabled();

    view.unmount();
    render(<AnnouncementForm action={action} labels={copy} values={{
      titleEn: "Edited English title",
      titleZhHk: "已編輯中文標題",
      ctaLabelEn: "Read more",
      ctaLabelZhHk: "閱讀更多",
      href: "/news",
      startsAt: new Date("2026-08-28T09:30:00.000Z"),
      endsAt: new Date("2026-08-29T09:30:00.000Z"),
      priority: 321,
    }}/>);
    expect(screen.getByLabelText(copy.titleEn, {exact: false})).toHaveValue("Edited English title");
    expect(screen.getByLabelText(copy.titleZhHk, {exact: false})).toHaveValue("已編輯中文標題");
    expect(screen.getByLabelText(copy.href, {exact: false})).toHaveValue("/news");
    expect(screen.getByLabelText(copy.priority, {exact: false})).toHaveValue(321);
  });

  it("retains submitted values and inline errors while pending, with shared scheduling help", () => {
    const copy = labels("en");
    const formAction = vi.fn();
    reactState.results.push([{
      status: "error",
      message: "Check the highlighted fields.",
      values: {
        titleEn: "Retained title",
        startsAt: "2026-08-28T09:30",
        endsAt: "2026-08-28T09:00",
      },
      fieldErrors: {
        startsAt: "Choose a valid start.",
        endsAt: "End must be later.",
      },
    }, formAction, true]);

    render(<AnnouncementForm action={vi.fn()} labels={copy}/>);

    expect(screen.getByLabelText(copy.titleEn, {exact: false})).toHaveValue("Retained title");
    expect(screen.getByLabelText(copy.startsAt, {exact: false})).toHaveValue("2026-08-28T09:30");
    expect(screen.getByLabelText(copy.endsAt, {exact: false})).toHaveValue("2026-08-28T09:00");
    expect(screen.getByText("Choose a valid start.")).toHaveAttribute("id", "startsAt-error");
    expect(screen.getByText("End must be later.")).toHaveAttribute("id", "endsAt-error");
    expect(screen.getByText(copy.timeHelp)).toHaveAttribute("id", "announcement-time-help");
    expect(screen.getByLabelText(copy.startsAt, {exact: false})).toHaveAttribute(
      "aria-describedby",
      "announcement-time-help startsAt-error",
    );
    expect(screen.getByLabelText(copy.endsAt, {exact: false})).toHaveAttribute(
      "aria-describedby",
      "announcement-time-help endsAt-error",
    );
    expect(screen.getByRole("button", {name: copy.saving})).toBeDisabled();
  });

  it("renders and wires pending lifecycle controls for publish and archive", () => {
    const publishAction = vi.fn();
    const archiveAction = vi.fn();
    const publishFormAction = vi.fn();
    const archiveFormAction = vi.fn();
    reactState.results.push(
      [{status: "idle"}, publishFormAction, true],
      [{status: "error"}, archiveFormAction, false],
    );

    render(<AnnouncementLifecycleControls
      archiveAction={archiveAction}
      archived={false}
      labels={{
        publish: "Publish",
        unpublish: "Unpublish",
        archive: "Archive",
        unarchive: "Restore",
        saving: "Saving…",
        error: "Could not update.",
        archivedNotice: "Archived.",
      }}
      publishAction={publishAction}
      published={false}
    />);

    expect(reactState.useActionState).toHaveBeenNthCalledWith(1, publishAction, {status: "idle"});
    expect(reactState.useActionState).toHaveBeenNthCalledWith(2, archiveAction, {status: "idle"});
    expect(screen.getByRole("button", {name: "Saving…"})).toBeDisabled();
    expect(screen.getByRole("button", {name: "Archive"})).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not update.");
  });
});
