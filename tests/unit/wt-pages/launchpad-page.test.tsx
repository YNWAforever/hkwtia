import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string | undefined, key: string): unknown {
  const root = namespace === undefined
    ? bundles[locale]
    : namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles[locale]);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

const listPublicCohorts = vi.hoisted(() => vi.fn());
const listPublishedPartners = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace?: string}) =>
    (key: string) => String(messageAt(locale, namespace, key))),
  setRequestLocale: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/db/repos/cohorts", () => ({cohortRepository: {listPublicCohorts}}));
vi.mock("@/lib/db/repos/landing-partners", () => ({landingPartnersRepository: {listPublished: listPublishedPartners}}));

describe("Launch Pad page — GBA opening", () => {
  beforeEach(() => {
    listPublicCohorts.mockReset().mockResolvedValue([]);
    listPublishedPartners.mockReset().mockResolvedValue([]);
  });

  it("renders the held Launch Pad copy without the route board, service cards, or funding picker", async () => {
    const {default: LaunchPadPage} = await import("@/app/[locale]/(public)/launchpad/page");
    render(await LaunchPadPage({
      params: Promise.resolve({locale: "en"}),
      searchParams: Promise.resolve({}),
    }));

    expect(screen.getByRole("heading", {level: 1, name: bundles.en.LaunchPad.title})).toBeInTheDocument();
    expect(screen.getByRole("navigation", {name: /breadcrumb/i})).toBeInTheDocument();
    expect(document.querySelector(".gba-route-board")).toBeNull();
    expect(document.querySelector(".service-grid")).toBeNull();
    expect(document.querySelector("form")).toBeNull();
    expect(screen.getAllByText(bundles.en.LaunchPad.description).length).toBeGreaterThan(0);
    expect(screen.queryByText(bundles.en.LaunchPad.services.softLanding.title)).toBeNull();
  });

  it("gives each SectionHeading its own eyebrow, distinct from the section title", async () => {
    const {default: LaunchPadPage} = await import("@/app/[locale]/(public)/launchpad/page");
    render(await LaunchPadPage({
      params: Promise.resolve({locale: "en"}),
      searchParams: Promise.resolve({}),
    }));

    for (const section of ["program", "calendar", "partners"] as const) {
      const eyebrow = bundles.en.LaunchPad[section].eyebrow as string;
      const title = bundles.en.LaunchPad[section].title as string;
      expect(eyebrow).not.toBe(title);
      expect(screen.getByText(eyebrow)).toBeInTheDocument();
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });
});
