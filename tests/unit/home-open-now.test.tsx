import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles[locale]);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

const listPublic = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    (key: string) => String(messageAt(locale, namespace, key))),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/db/repos/events", () => ({eventsRepository: {listPublic}}));

describe("OpenNow", () => {
  it("renders the #home-discover honest-empty state and both interest actions when no event is open", async () => {
    listPublic.mockResolvedValueOnce([]);
    const {OpenNow} = await import("@/components/home/open-now");
    render(await OpenNow({locale: "en"}));

    expect(document.querySelector("#home-discover")).not.toBeNull();
    const heading = screen.getByRole("heading", {level: 3, name: bundles.en.Home.openNow.empty.title});
    expect(heading.closest(".honest-empty")).not.toBeNull();
    expect(screen.getByRole("link", {name: bundles.en.Home.openNow.updatesAction})).toHaveAttribute("href", "/events?status=open");
    expect(screen.getByRole("link", {name: bundles.en.Home.openNow.challengeAction})).toHaveAttribute("href", "/contact");
  });

  it("renders up to 3 open events as cards linking to their own event page when available", async () => {
    listPublic.mockResolvedValueOnce([
      {id: "1", slug: "ai-clinic", title: "AI Clinic", description: "d", startsAt: "2026-10-01T02:00:00.000Z", endsAt: null, venue: "Kwun Tong", capacity: 40, hero: null},
      {id: "2", slug: "demo-day", title: "Demo Day", description: "d", startsAt: "2026-11-01T02:00:00.000Z", endsAt: null, venue: null, capacity: null, hero: null},
    ]);
    const {OpenNow} = await import("@/components/home/open-now");
    render(await OpenNow({locale: "en"}));

    expect(screen.queryByText(bundles.en.Home.openNow.empty.title)).not.toBeInTheDocument();
    const heading = screen.getByRole("heading", {level: 3, name: "AI Clinic"});
    const card = heading.closest("a")!;
    expect(card).toHaveAttribute("href", "/events/ai-clinic");
    expect(within(card).getByText(/Kwun Tong/)).toBeInTheDocument();
    expect(screen.getByRole("heading", {level: 3, name: "Demo Day"})).toBeInTheDocument();
    expect(listPublic).toHaveBeenCalledWith(
      {kind: "anonymous", userId: null},
      expect.objectContaining({status: "open", locale: "en", limit: 3}),
    );
  });

  it("degrades to the honest-empty state when the read rejects", async () => {
    listPublic.mockRejectedValueOnce(new Error("db down"));
    const {OpenNow} = await import("@/components/home/open-now");
    render(await OpenNow({locale: "en"}));

    expect(screen.getByRole("heading", {level: 3, name: bundles.en.Home.openNow.empty.title})).toBeInTheDocument();
  });
});
