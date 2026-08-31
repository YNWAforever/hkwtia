import {readFileSync} from "node:fs";

import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {AnnouncementBar} from "@/components/layout/announcement-bar";
import {projectPersistedAnnouncement, resolveAnnouncement} from "@/lib/public-shell/announcement";

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

  it("rejects null", () => {
    expect(resolveAnnouncement(null, new Date("2026-08-28T12:00:00.000Z"))).toBeNull();
  });

  it("rejects a non-canonical href", () => {
    expect(resolveAnnouncement({...record, href: "/activities"}, new Date("2026-08-28T12:00:00.000Z"))).toBeNull();
  });

  it("rejects a malformed start", () => {
    expect(resolveAnnouncement({...record, startsAt: "not-a-date"}, new Date("2026-08-28T12:00:00.000Z"))).toBeNull();
  });

  it("rejects an impossible calendar date", () => {
    expect(resolveAnnouncement({...record, startsAt: "2026-02-31T00:00:00.000Z"}, new Date("2026-08-28T12:00:00.000Z"))).toBeNull();
  });

  it("rejects an empty window", () => {
    expect(resolveAnnouncement({...record, endsAt: record.startsAt}, new Date("2026-08-28T12:00:00.000Z"))).toBeNull();
  });

  it("rejects missing English text", () => {
    expect(resolveAnnouncement({...record, text: {...record.text, en: ""}}, new Date("2026-08-28T12:00:00.000Z"))).toBeNull();
  });

  it("rejects future and expired records", () => {
    expect(resolveAnnouncement(record, new Date("2026-08-27T23:59:59.999Z"))).toBeNull();
    expect(resolveAnnouncement(record, new Date("2026-08-30T00:00:00.000Z"))).toBeNull();
  });
});

describe("persisted announcement projection", () => {
  it("exposes only display-safe bilingual content for the later public cutover", () => {
    const projected = projectPersistedAnnouncement({
      id: "11111111-1111-4111-8111-111111111111",
      titleEn: "Applications are open",
      titleZhHk: "現正接受申請",
      ctaLabelEn: "View programme",
      ctaLabelZhHk: "查看計劃",
      href: "/launchpad",
      startsAt: new Date("2026-08-28T00:00:00.000Z"),
      endsAt: new Date("2026-08-29T00:00:00.000Z"),
      priority: 50,
      publishedAt: new Date("2026-08-27T00:00:00.000Z"),
      archivedAt: null,
      createdAt: new Date("2026-08-27T00:00:00.000Z"),
      updatedAt: new Date("2026-08-27T00:00:00.000Z"),
    });

    expect(projected).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      title: {en: "Applications are open", "zh-HK": "現正接受申請"},
      ctaLabel: {en: "View programme", "zh-HK": "查看計劃"},
      href: "/launchpad",
      startsAt: "2026-08-28T00:00:00.000Z",
      endsAt: "2026-08-29T00:00:00.000Z",
      priority: 50,
    });
    expect(projected).not.toHaveProperty("publishedAt");
    expect(projected).not.toHaveProperty("archivedAt");
  });

  it("keeps PR4 disconnected from the public layout", () => {
    const source = readFileSync("app/[locale]/(public)/layout.tsx", "utf8");
    expect(source).toContain("announcement={null}");
    expect(source).not.toContain("announcementsRepository");
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
