import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
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

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    (key: string) => String(messageAt(locale, namespace, key))),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

describe("Pathways", () => {
  it("renders the 5 audience cards with the D-7 canonical hrefs, in order", async () => {
    const {Pathways} = await import("@/components/home/pathways");
    render(await Pathways({locale: "en"}));

    const cards = screen.getAllByRole("link").filter((link) => link.className.includes("audience-card"));
    expect(cards).toHaveLength(5);
    expect(cards.map((card) => card.getAttribute("href"))).toEqual([
      "/membership", "/events", "/showcase", "/membership", "/launchpad",
    ]);
    expect(cards.map((card) => card.className)).toEqual([
      "audience-card accent-cyan", "audience-card accent-jade", "audience-card accent-amber",
      "audience-card accent-blue", "audience-card accent-violet",
    ]);
    expect(screen.getByText(bundles.en.Home.pathways.items.corporates.title)).toBeInTheDocument();
    expect(screen.getByText(bundles.en.Home.pathways.items.gba.cta)).toBeInTheDocument();
  });
});
