import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {AnnouncementBar} from "@/components/layout/announcement-bar";
import {resolveAnnouncement} from "@/lib/public-shell/announcement";

vi.mock("@/i18n/navigation", () => ({
  Link: ({href, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {href: string}) =>
    <a href={href} {...props} />,
}));

const record = {
  id: "launch",
  startsAt: "2026-08-28T00:00:00.000Z",
  endsAt: "2026-08-29T00:00:00.000Z",
  href: "/events",
  text: {en: "See upcoming events", "zh-HK": "瀏覽即將舉行的活動"},
};

describe("announcement resolver", () => {
  it("uses an inclusive start and exclusive end", () => {
    expect(resolveAnnouncement(record, new Date(record.startsAt))).toEqual(record);
    expect(resolveAnnouncement(record, new Date("2026-08-28T23:59:59.999Z"))).toEqual(record);
    expect(resolveAnnouncement(record, new Date(record.endsAt))).toBeNull();
  });

  it.each([
    [null, "null"],
    [{...record, href: "/activities"}, "non-canonical href"],
    [{...record, startsAt: "not-a-date"}, "malformed start"],
    [{...record, startsAt: "2026-02-31T00:00:00.000Z"}, "impossible calendar date"],
    [{...record, endsAt: record.startsAt}, "empty window"],
    [{...record, text: {...record.text, en: ""}}, "missing English text"],
  ])("rejects %s (%s)", (value) => {
    expect(resolveAnnouncement(value, new Date("2026-08-28T12:00:00.000Z"))).toBeNull();
  });

  it("rejects future and expired records", () => {
    expect(resolveAnnouncement(record, new Date("2026-08-27T23:59:59.999Z"))).toBeNull();
    expect(resolveAnnouncement(record, new Date("2026-08-30T00:00:00.000Z"))).toBeNull();
  });
});

describe("AnnouncementBar", () => {
  it("renders localized text as a canonical anchor and dismisses only local state", () => {
    const announcement = resolveAnnouncement(record, new Date("2026-08-28T12:00:00.000Z"));
    render(
      <AnnouncementBar
        announcement={announcement}
        locale="zh-HK"
        label="公告"
        dismissLabel="關閉公告"
      />,
    );

    expect(screen.getByRole("complementary", {name: "公告"})).toBeInTheDocument();
    expect(screen.getByRole("complementary", {name: "公告"})).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("complementary", {name: "公告"})).toHaveAttribute("aria-atomic", "true");
    expect(screen.getByRole("link", {name: record.text["zh-HK"]})).toHaveAttribute("href", "/events");
    expect(screen.getByRole("link", {name: record.text["zh-HK"]})).toHaveClass("min-h-11", "min-w-11");
    fireEvent.click(screen.getByRole("button", {name: "關閉公告"}));
    expect(screen.queryByRole("complementary", {name: "公告"})).not.toBeInTheDocument();
    expect(document.cookie).toBe("");
  });

  it("renders nothing for a null provider result", () => {
    const {container} = render(
      <AnnouncementBar announcement={null} locale="en" label="Announcement" dismissLabel="Dismiss announcement" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps an arbitrary allowed token shrinkable and breakable at narrow widths", () => {
    const announcement = resolveAnnouncement(
      {...record, text: {en: "a".repeat(180), "zh-HK": "公告"}},
      new Date("2026-08-28T12:00:00.000Z"),
    );
    render(
      <AnnouncementBar announcement={announcement} locale="en" label="Announcement" dismissLabel="Dismiss announcement" />,
    );

    expect(screen.getByRole("link", {name: "a".repeat(180)})).toHaveClass("flex-1", "break-all");
  });
});
