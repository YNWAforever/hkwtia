import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles[locale]);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

const listPublic = vi.hoisted(() => vi.fn());
const listFeaturedPublic = vi.hoisted(() => vi.fn());
const showcaseListPublished = vi.hoisted(() => vi.fn());
const partnersListPublished = vi.hoisted(() => vi.fn());
const listPublicCohorts = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    Object.assign(
      (key: string, values?: Record<string, string | number>) => {
        const raw = String(messageAt(locale, namespace, key));
        return Object.entries(values ?? {}).reduce((text, [name, replacement]) => text.replace(`{${name}}`, String(replacement)), raw);
      },
      {raw: (key: string) => messageAt(locale, namespace, key)},
    )),
  setRequestLocale: vi.fn(),
}));
vi.mock("next/image", () => ({
  default: ({alt, src, ...props}: {alt: string; src: string}) => <img alt={alt} src={src} {...props} />,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/db/repos/events", () => ({
  eventsRepository: {
    listPublic: listPublic,
    listFeaturedPublic: listFeaturedPublic,
    countPublic: vi.fn(async () => 0),
  },
}));
vi.mock("@/lib/db/repos/showcase", () => ({showcaseRepository: {listPublished: showcaseListPublished}}));
vi.mock("@/lib/db/repos/partners", () => ({partnersRepository: {listPublished: partnersListPublished}}));
vi.mock("@/lib/db/repos/cohorts", () => ({cohortRepository: {listPublicCohorts}}));
// Deterministic: impact-evidence's asaRegions tile reads content/programs/asa directly, not
// through a mockable repository. Forcing every edition "unrecorded" here means the section's
// visibility in every test below depends only on the two repos this file already controls,
// not on whatever content/programs/asa.ts happens to contain when the suite runs.
vi.mock("@/content/programs/asa", () => ({
  asa: {id: "asa", editions: [{labelEn: "x", labelZh: "x", yearStart: 2013, funder: {kind: "none-recorded"}, regions: {kind: "unrecorded"}, winners: {kind: "unrecorded"}, images: []}]},
}));

const sectionIds = [
  "hero-title", "open-now-title", "pathways-title", "events-journey-title",
  "market-products-title", "outcomes-title", "ecosystem-title", "programme-showcase-title",
  "gba-gateway-title", "impact-title", "archive-stories-title", "legacy-network-title",
  "conversion-paths-title",
] as const;

function setEmptyFixtures() {
  listPublic.mockResolvedValue([]);
  listFeaturedPublic.mockResolvedValue([]);
  showcaseListPublished.mockResolvedValue([]);
  partnersListPublished.mockResolvedValue([]);
  listPublicCohorts.mockResolvedValue([]);
}

const pastEvent = {id: "1", slug: "past-event", title: "Past Event", description: "d", startsAt: "2025-01-01T02:00:00.000Z", endsAt: null, venue: null, capacity: null, hero: null};
const publishedPartner = {id: "1", name: "Partner", category: "supporting" as const, websiteUrl: null, logoUrl: null, logoAlt: null, displayOrder: 1, featured: false};

describe("Home page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setEmptyFixtures();
  });

  it.each(["en", "zh-HK"] as const)("renders all 13 sections as labelled landmarks, in order, in %s", async (locale) => {
    listPublic.mockImplementation(async (_actor: unknown, options: {status: string}) =>
      options.status === "past" ? [pastEvent] : []);
    partnersListPublished.mockResolvedValue([publishedPartner]);

    const {default: HomePage} = await import("@/app/[locale]/(public)/page");
    render(await HomePage({params: Promise.resolve({locale})}));

    const labelled = [...document.querySelectorAll("[aria-labelledby]")]
      .map((el) => el.getAttribute("aria-labelledby"))
      .filter((id): id is string => (sectionIds as readonly string[]).includes(id ?? ""));
    expect(labelled).toEqual([...sectionIds]);

    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
    expect(document.querySelector('script[type="application/ld+json"]')?.textContent).toContain('"@type":"Organization"');
  });

  it("hides legacy-network at 0 published partners and shows it once a partner is published", async () => {
    const {default: HomePage} = await import("@/app/[locale]/(public)/page");

    const first = render(await HomePage({params: Promise.resolve({locale: "en"})}));
    expect(document.querySelector('[aria-labelledby="legacy-network-title"]')).toBeNull();
    first.unmount();

    partnersListPublished.mockResolvedValue([publishedPartner]);
    render(await HomePage({params: Promise.resolve({locale: "en"})}));
    expect(document.querySelector('[aria-labelledby="legacy-network-title"]')).not.toBeNull();
  });

  it("omits every impact tile, and hides the section, when every metric is 0", async () => {
    const {default: HomePage} = await import("@/app/[locale]/(public)/page");
    render(await HomePage({params: Promise.resolve({locale: "en"})}));

    expect(document.querySelector('[aria-labelledby="impact-title"]')).toBeNull();
  });

  it("renders the Open Now honest-empty state when no event is open, and available cards once one is", async () => {
    const {default: HomePage} = await import("@/app/[locale]/(public)/page");

    const first = render(await HomePage({params: Promise.resolve({locale: "en"})}));
    // Scoped to the Open Now landmark: Home.eventsJourney.emptyTitle shares the identical
    // English string with Home.openNow.empty.title ("No activities are currently open."), so
    // an unscoped query would match both sections' empty states and fail as ambiguous.
    const openNowSection = document.querySelector('[aria-labelledby="open-now-title"]') as HTMLElement;
    expect(within(openNowSection).getByText(bundles.en.Home.openNow.empty.title)).toBeInTheDocument();
    first.unmount();

    listPublic.mockImplementation(async (_actor: unknown, options: {status: string}) =>
      options.status === "open"
        ? [{id: "1", slug: "ai-clinic", title: "AI Clinic", description: "d", startsAt: "2026-10-01T02:00:00.000Z", endsAt: null, venue: null, capacity: null, hero: null}]
        : []);
    render(await HomePage({params: Promise.resolve({locale: "en"})}));
    expect(screen.getByRole("heading", {level: 3, name: "AI Clinic"})).toBeInTheDocument();
  });

  it("exports a force-dynamic home route", async () => {
    const home = await import("@/app/[locale]/(public)/page");
    expect(home.dynamic).toBe("force-dynamic");
  });
});
