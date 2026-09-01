import {renderToStaticMarkup} from "react-dom/server";
import type {ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {ScheduledAnnouncementProjection} from "@/lib/public-shell/announcement";

const announcements = vi.hoisted(() => ({getActive: vi.fn()}));
const barState = vi.hoisted(() => ({announcement: null as Record<string, unknown> | null}));

vi.mock("@/lib/db/repos/announcements", () => ({announcementsRepository: announcements}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (input: {namespace: string}) => {
    const translate = (key: string) => key;
    return input.namespace === "Concierge" ? Object.assign(translate, {raw: (key: string) => key}) : translate;
  },
  setRequestLocale: () => undefined,
}));
vi.mock("@/lib/config/env", () => ({publicEnv: () => ({})}));
vi.mock("@/components/ai/concierge-widget", () => ({ConciergeWidget: () => <div data-shell="concierge" />}));
vi.mock("@/components/layout/site-footer", () => ({SiteFooter: () => <footer>Footer</footer>}));
vi.mock("@/components/layout/site-header", () => ({SiteHeader: () => <header>Header</header>}));
vi.mock("@/components/layout/announcement-bar", () => ({
  AnnouncementBar: ({announcement}: {announcement: {id: string; href: string; text: string; ctaLabel: string} | null}) => {
    barState.announcement = announcement;
    return announcement ? <aside>{announcement.text} {announcement.ctaLabel}</aside> : null;
  },
}));

const activeProjection: ScheduledAnnouncementProjection = {
  id: "11111111-1111-4111-8111-111111111111",
  title: {en: "Applications are open", "zh-HK": "現正接受申請"},
  ctaLabel: {en: "View programme", "zh-HK": "查看計劃"},
  href: "/launchpad",
  startsAt: "2026-08-29T00:00:00.000Z",
  endsAt: "2026-08-30T00:00:00.000Z",
  priority: 20,
};

async function renderPublicLayout(locale: "en" | "zh-HK"): Promise<string> {
  const {default: PublicLayout} = await import("@/app/[locale]/(public)/layout");
  return renderToStaticMarkup(await PublicLayout({children: <p>Shell remains available</p> as ReactNode, params: Promise.resolve({locale})}));
}

describe("public layout announcement cutover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    barState.announcement = null;
  });

  it("passes the active safe announcement to AnnouncementBar and hides it on a read failure", async () => {
    announcements.getActive.mockResolvedValueOnce(activeProjection);
    const rendered = await renderPublicLayout("en");

    expect(rendered).toContain(activeProjection.title.en);
    expect(rendered).toContain(activeProjection.ctaLabel.en);
    expect(announcements.getActive).toHaveBeenCalledWith(expect.any(Date));
    expect(barState.announcement).toEqual({
      id: activeProjection.id,
      href: activeProjection.href,
      text: activeProjection.title.en,
      ctaLabel: activeProjection.ctaLabel.en,
    });
    expect(barState.announcement).not.toHaveProperty("startsAt");
    expect(barState.announcement).not.toHaveProperty("endsAt");
    expect(barState.announcement).not.toHaveProperty("priority");

    announcements.getActive.mockRejectedValueOnce(new Error("database"));
    await expect(renderPublicLayout("en")).resolves.toContain("Shell remains available");
    expect(barState.announcement).toBeNull();

    announcements.getActive.mockResolvedValueOnce({...activeProjection, title: {en: "", "zh-HK": ""}});
    await renderPublicLayout("en");
    expect(barState.announcement).toBeNull();
  });
});
