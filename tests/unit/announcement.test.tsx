import {readFileSync} from "node:fs";

import {fireEvent, render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {AnnouncementBar} from "@/components/layout/announcement-bar";
import {projectPersistedAnnouncement, resolveAnnouncement, toAnnouncementBarView} from "@/lib/public-shell/announcement";

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
  const persisted = {
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
  };

  it("exposes only display-safe bilingual content for the public-layout selector", () => {
    const projected = projectPersistedAnnouncement(persisted);
    expect(projected).toEqual({
      id: persisted.id,
      title: {en: persisted.titleEn, "zh-HK": persisted.titleZhHk},
      ctaLabel: {en: persisted.ctaLabelEn, "zh-HK": persisted.ctaLabelZhHk},
      href: persisted.href,
      startsAt: "2026-08-28T00:00:00.000Z",
      endsAt: "2026-08-29T00:00:00.000Z",
      priority: 50,
    });
    expect(projected).not.toHaveProperty("publishedAt");
    expect(projected).not.toHaveProperty("archivedAt");
  });

  it("localizes the repository projection and strips lifecycle fields before the client boundary", () => {
    const view = toAnnouncementBarView(projectPersistedAnnouncement(persisted), "zh-HK");
    expect(view).toEqual({id: persisted.id, href: "/launchpad", text: "現正接受申請", ctaLabel: "查看計劃"});
    expect(view).not.toHaveProperty("startsAt");
    expect(view).not.toHaveProperty("endsAt");
    expect(view).not.toHaveProperty("priority");
    expect(toAnnouncementBarView({...projectPersistedAnnouncement(persisted), title: {en: "", "zh-HK": ""}}, "en")).toBeNull();
  });

  it("activates the repository-selected announcement in the public layout", () => {
    const source = readFileSync("app/[locale]/(public)/layout.tsx", "utf8");
    expect(source).toContain("announcementsRepository.getActive");
    expect(source).toContain("toAnnouncementBarView");
    expect(source).not.toContain("announcement={null}");
  });
});

describe("AnnouncementBar", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    document.body.innerHTML = "";
  });

  const announcement = {id: "launch", href: "/events" as const, text: "瀏覽即將舉行的活動", ctaLabel: "查看活動"};

  it("renders the donor bar and dismisses it for the session only", () => {
    document.body.insertAdjacentHTML("afterbegin", '<header class="site-header"></header>');
    render(<AnnouncementBar announcement={announcement} label="公告" dismissLabel="關閉公告" />);

    const bar = screen.getByRole("complementary", {name: "公告"});
    expect(bar).toHaveClass("announcement");
    expect(bar).toHaveAttribute("aria-live", "polite");
    expect(bar).toHaveAttribute("aria-atomic", "true");
    expect(bar.querySelector(".announcement-dot")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("瀏覽即將舉行的活動")).toBeInTheDocument();
    expect(screen.getByRole("link", {name: "查看活動"})).toHaveAttribute("href", "/events");

    const dismiss = screen.getByRole("button", {name: "關閉公告"});
    expect(dismiss).toHaveClass("announcement-close");
    fireEvent.click(dismiss);

    expect(screen.queryByRole("complementary", {name: "公告"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "關閉公告"})).not.toBeInTheDocument();
    expect(document.querySelector("header.site-header")).toHaveClass("no-announcement");
    expect(window.sessionStorage.getItem("hkwtia:announcement-dismissed")).toBe("launch");
    expect(document.cookie).toBe("");
  });

  it("stays dismissed for the same id after a remount and returns for a new one", () => {
    window.sessionStorage.setItem("hkwtia:announcement-dismissed", "launch");
    const first = render(<AnnouncementBar announcement={announcement} label="公告" dismissLabel="關閉公告" />);
    expect(screen.queryByRole("complementary", {name: "公告"})).not.toBeInTheDocument();
    first.unmount();

    render(<AnnouncementBar announcement={{...announcement, id: "second"}} label="公告" dismissLabel="關閉公告" />);
    expect(screen.getByRole("complementary", {name: "公告"})).toBeInTheDocument();
  });

  it("survives a sessionStorage that throws", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<AnnouncementBar announcement={announcement} label="Announcement" dismissLabel="Dismiss announcement" />);
    expect(screen.getByRole("complementary", {name: "Announcement"})).toBeInTheDocument();
    getItem.mockRestore();
  });

  it("renders nothing for a null provider result", () => {
    const {container} = render(<AnnouncementBar announcement={null} label="Announcement" dismissLabel="Dismiss announcement" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps an arbitrary allowed token breakable at narrow widths", () => {
    render(<AnnouncementBar announcement={{...announcement, text: "a".repeat(180)}} label="Announcement" dismissLabel="Dismiss announcement" />);
    expect(screen.getByText("a".repeat(180))).toHaveClass("announcement-text");
  });
});
